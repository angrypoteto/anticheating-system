#!/usr/bin/env node
/**
 * Restores a data-only backup produced by scripts/backup.mjs.
 *
 * Schema first: run the migrations in web/prisma/migrations against the target
 * database, then this replays the rows.
 *
 * Usage:
 *   node scripts/restore.mjs backups/backup-<stamp>.json.gz [--dry-run]
 *
 * Not covered by a data-only backup, and not recoverable here:
 *   - auth.users     accounts live in Supabase Auth, outside the public schema.
 *                    public.users rows will restore, but nobody can log in until
 *                    the accounts are recreated.
 *   - Vault secrets  ai_provider_keys rows restore with a dangling pointer; the
 *                    API keys themselves must be re-added in the admin console.
 *   - Storage files  lesson uploads live in the bucket, copy it separately.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const WEB = path.resolve(import.meta.dirname, "..");

function readEnv(file) {
  const p = path.join(WEB, file);
  if (!fs.existsSync(p)) return {};
  return Object.fromEntries(
    fs.readFileSync(p, "utf8").split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
  );
}

const env = { ...readEnv(".env"), ...readEnv(".env.local") };
const file = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!file) {
  console.error("usage: node scripts/restore.mjs <backup.json.gz> [--dry-run]");
  process.exit(1);
}

const archive = JSON.parse(gunzipSync(fs.readFileSync(file)).toString("utf8"));
if (archive.kind !== "data") {
  console.error("This is a full pg_dump; restore it with psql instead — see docs/RUNBOOK.md");
  process.exit(1);
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

// sections.instructor_id and enrollments both point at users, so people go in
// first, then classes, then who sits which. There is no longer a cycle to break:
// class membership lives in enrollments rather than on the user row.
const ORDER = [
  "users", "sections", "enrollments", "exams", "questions", "question_answers",
  "lesson_files", "exam_sessions", "answers", "flags",
  "audit_log", "backup_runs", "ai_provider_keys",
];

// Not every table keys on "id" — question_answers is keyed by the question it
// belongs to. Getting this wrong silently skipped the answer key on restore.
const CONFLICT_COLUMN = {
  question_answers: "question_id",
  enrollments: "student_id,section_id",
};
const keyOf = (table) => CONFLICT_COLUMN[table] ?? "id";

console.log(`restoring ${file}`);
console.log(`taken at ${archive.taken_at}`);
if (dryRun) console.log("DRY RUN — nothing will be written\n");

let failed = 0;

for (const table of ORDER) {
  const rows = archive.tables[table] ?? [];
  if (!rows.length) {
    console.log(`  ${table.padEnd(18)} empty, skipped`);
    continue;
  }

  const payload = rows;

  if (dryRun) {
    console.log(`  ${table.padEnd(18)} would restore ${payload.length} rows`);
    continue;
  }

  const { error } = await admin.from(table).upsert(payload, { onConflict: keyOf(table) });
  if (error) {
    console.log(`  ${table.padEnd(18)} FAILED — ${error.message}`);
    failed++;
  } else {
    console.log(`  ${table.padEnd(18)} ${String(payload.length).padStart(5)} rows`);
  }
}

console.log(
  failed
    ? `\n${failed} table(s) failed — the database may be partially restored.`
    : dryRun
      ? "\nDry run complete."
      : "\nRestore complete.",
);
console.log(
  "\nReminder: Supabase Auth accounts, Vault secrets and Storage files are NOT in\n" +
  "this archive. Recreate logins and re-add AI provider keys after restoring.",
);
process.exit(failed ? 1 : 0);
