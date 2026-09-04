/**
 * Remove lesson files left in Storage.
 *
 * Generation deletes an upload as soon as it has read it, so in normal running
 * this bucket stays empty. Anything here is either from before that behaviour
 * existed, or from a generation that failed before it got that far.
 *
 * Lists first and asks for --yes before removing anything: these are files a
 * teacher uploaded, and the extracted text on lesson_files is not a substitute
 * for the original if they wanted it back.
 *
 *   node scripts/sweep-uploads.mjs          # list what is there
 *   node scripts/sweep-uploads.mjs --yes    # remove it
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("No .env.local here — run this from the web/ directory.");
  process.exit(1);
}
const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const go = process.argv.includes("--yes");

const { data: folders, error } = await admin.storage.from("lesson-files").list();
if (error) {
  console.error(`Could not list the bucket: ${error.message}`);
  process.exit(1);
}

const paths = [];
for (const folder of folders ?? []) {
  const { data: files } = await admin.storage.from("lesson-files").list(folder.name);
  for (const f of files ?? []) paths.push(`${folder.name}/${f.name}`);
}

if (!paths.length) {
  console.log("Nothing left in the bucket.");
  process.exit(0);
}

// Say which exam each one belongs to, so nothing is deleted blind.
const examIds = [...new Set(paths.map((p) => p.split("/")[0]))];
const { data: exams } = await admin.from("exams").select("id, title").in("id", examIds);
const title = new Map((exams ?? []).map((e) => [e.id, e.title]));

console.log(`${paths.length} file(s) in lesson-files:\n`);
for (const p of paths) {
  const [examId, name] = [p.split("/")[0], p.split("/").slice(1).join("/")];
  console.log(`  ${name}`);
  console.log(`    exam: ${title.get(examId) ?? "(exam no longer exists)"}`);
}

if (!go) {
  console.log(`\nNothing removed. Re-run with --yes to delete these ${paths.length} file(s).`);
  console.log("The extracted text stays on lesson_files either way, so question");
  console.log("generation keeps working without them.");
  process.exit(0);
}

const { error: rmError } = await admin.storage.from("lesson-files").remove(paths);
if (rmError) {
  console.error(`Could not remove: ${rmError.message}`);
  process.exit(1);
}
await admin
  .from("lesson_files")
  .update({ file_deleted_at: new Date().toISOString() })
  .in("storage_path", paths);

console.log(`\nRemoved ${paths.length} file(s).`);
