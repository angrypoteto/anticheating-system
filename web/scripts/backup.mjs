#!/usr/bin/env node
/**
 * Takes a backup without depending on GitHub Actions.
 *
 * Two modes, picked automatically:
 *   - full  : pg_dump via Docker (schema + data). Needs DIRECT_URL and Docker.
 *   - data  : every table exported as JSON through PostgREST. Needs only the
 *             service key, so it works before the database password is known.
 *
 * A data-only export is still a complete restore path, because every schema
 * change is committed under web/prisma/migrations — replay those, then import.
 *
 * Usage:  node scripts/backup.mjs [--out DIR] [--no-upload]
 */
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const WEB = path.resolve(import.meta.dirname, "..");
const ROOT = path.resolve(WEB, "..");

function readEnv(file) {
  const p = path.join(WEB, file);
  if (!fs.existsSync(p)) return {};
  return Object.fromEntries(
    fs.readFileSync(p, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
      }),
  );
}

const env = { ...readEnv(".env"), ...readEnv(".env.local") };
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = env.SUPABASE_SECRET_KEY;
const DIRECT = env.DIRECT_URL;

if (!URL || !SECRET) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in web/.env.local");
  process.exit(1);
}

const args = process.argv.slice(2);
const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : path.join(ROOT, "backups");
const upload = !args.includes("--no-upload");

// Order matters on restore: sections name an instructor and enrollments name
// both a student and a section, so people and classes go in before the links.
const TABLES = [
  "users", "sections", "enrollments", "exams", "questions", "question_answers",
  "lesson_files", "exam_sessions", "answers", "flags",
  "audit_log", "backup_runs", "ai_provider_keys",
];

const admin = createClient(URL, SECRET, { auth: { persistSession: false } });
const stamp = new Date().toISOString().replace(/[:.]/g, "").replace(/-/g, "").slice(0, 15) + "Z";
fs.mkdirSync(outDir, { recursive: true });

function dockerAvailable() {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function fullDump() {
  const file = path.join(outDir, `backup-${stamp}.sql`);
  console.log("mode: full (pg_dump via Docker)");
  execFileSync(
    "docker",
    ["run", "--rm", "postgres:17", "pg_dump", DIRECT,
      "--no-owner", "--no-privileges", "--clean", "--if-exists", "--schema=public"],
    { stdio: ["ignore", fs.openSync(file, "w"), "inherit"], maxBuffer: 1024 * 1024 * 512 },
  );
  const sql = fs.readFileSync(file, "utf8");
  const tables = (sql.match(/^CREATE TABLE/gm) ?? []).length;
  if (tables < 10) {
    throw new Error(`dump contains only ${tables} tables — refusing to trust it`);
  }
  console.log(`  ${tables} tables, ${(sql.length / 1024).toFixed(0)} KB`);
  fs.unlinkSync(file);
  return { name: `backup-${stamp}.sql.gz`, body: gzipSync(sql), kind: "full" };
}

async function dataDump() {
  console.log("mode: data (JSON export via PostgREST)");
  const out = { taken_at: new Date().toISOString(), kind: "data", tables: {} };
  for (const t of TABLES) {
    const { data, error } = await admin.from(t).select("*");
    if (error) throw new Error(`${t}: ${error.message}`);
    out.tables[t] = data ?? [];
    console.log(`  ${t.padEnd(18)} ${String(data?.length ?? 0).padStart(5)} rows`);
  }
  const total = Object.values(out.tables).reduce((n, r) => n + r.length, 0);
  if (total === 0) throw new Error("exported zero rows — refusing to trust it");
  return { name: `backup-${stamp}.json.gz`, body: gzipSync(JSON.stringify(out, null, 1)), kind: "data" };
}

/**
 * Lesson files live in Storage, not the database, so a table dump alone would
 * lose them — and the proposal lists them as something backups must cover.
 * Each object is copied into the backups bucket under this run's stamp.
 */
async function backupLessonFiles() {
  const copied = [];
  const { data: examFolders, error } = await admin.storage.from("lesson-files").list("", { limit: 1000 });
  if (error) {
    console.log(`  (lesson files: ${error.message})`);
    return copied;
  }

  for (const folder of examFolders ?? []) {
    if (folder.id) continue; // a file at the root, not an exam folder
    const { data: files } = await admin.storage.from("lesson-files").list(folder.name, { limit: 1000 });
    for (const f of files ?? []) {
      const from = `${folder.name}/${f.name}`;
      const { data: blob, error: dlErr } = await admin.storage.from("lesson-files").download(from);
      if (dlErr || !blob) {
        console.log(`  lesson file FAILED ${from}: ${dlErr?.message}`);
        continue;
      }
      const to = `lesson-files/${stamp}/${from}`;
      const { error: upErr } = await admin.storage
        .from("backups")
        .upload(to, Buffer.from(await blob.arrayBuffer()), { upsert: true });
      if (upErr) console.log(`  lesson file FAILED ${from}: ${upErr.message}`);
      else copied.push(to);
    }
  }
  return copied;
}

let status = "FAILED";
let storagePath = null;

try {
  const canFull = DIRECT && !DIRECT.includes("[DB_PASSWORD]") && dockerAvailable();
  if (!canFull) {
    const why = !DIRECT || DIRECT.includes("[DB_PASSWORD]")
      ? "DIRECT_URL not set (database password unknown)"
      : "Docker not running";
    console.log(`(${why} — falling back to a data-only export)`);
  }

  const archive = canFull ? await fullDump() : await dataDump();
  const local = path.join(outDir, archive.name);
  fs.writeFileSync(local, archive.body);
  console.log(`\nwrote ${local} (${(archive.body.length / 1024).toFixed(0)} KB)`);

  if (upload) {
    await admin.storage.createBucket("backups", { public: false }).catch(() => {});
    const { error } = await admin.storage
      .from("backups")
      .upload(archive.name, archive.body, { contentType: "application/gzip", upsert: true });
    if (error) throw new Error(`upload failed: ${error.message}`);
    storagePath = `backups/${archive.name}`;
    console.log(`uploaded to ${storagePath}`);

    const lessons = await backupLessonFiles();
    console.log(`lesson files copied: ${lessons.length}`);
  }

  status = "SUCCEEDED";
} catch (e) {
  console.error("\nBACKUP FAILED:", e.message);
  process.exitCode = 1;
} finally {
  // Recorded either way, so the Health page reflects reality rather than silence.
  await admin.from("backup_runs").insert({
    status,
    finished_at: new Date().toISOString(),
    storage_path: storagePath,
  });
  console.log(`recorded backup_runs: ${status}`);
}
