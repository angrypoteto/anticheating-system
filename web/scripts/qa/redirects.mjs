/**
 * Where a sign-in is allowed to send somebody afterwards.
 *
 * Every sign-in path carries a `next`, and every one of them is a way off the
 * site if it is taken on trust. This feeds safeNext() the shapes an open
 * redirect is usually built from — the ones a browser quietly turns into
 * another host — and the ordinary paths it must keep.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));

const { safeNext } = await import(new URL("../../src/lib/safe-next.ts", import.meta.url).href);

let checks = 0;
const bugs = [];
const t = (c, l) => {
  checks++;
  if (!c) bugs.push(l);
  console.log(`  ${c ? "ok " : "BUG"}  ${l}`);
};

console.log("\n== Kept: paths on this site ==");
for (const p of ["/", "/e/abc123", "/exam/9f1c?from=link", "/teacher/exams#top", "/exams/1/monitor"]) {
  t(safeNext(p) === p, `kept ${p}`);
}

console.log("\n== Refused: anything that can leave the site ==");
for (const p of [
  "//evil.example",
  "/\\evil.example",
  "/\\/evil.example",
  "\\\\evil.example",
  "https://evil.example",
  "javascript:alert(1)",
  "evil.example",
  "/\t/evil.example",
  "/ /evil.example",
  "/\n/evil.example",
  "/%0a",
  "",
]) {
  const out = safeNext(p);
  // "/%0a" stays encoded, so it is only ever a path; the rest must be refused.
  const safe = p === "/%0a" ? out === p : out === "/";
  t(safe, `refused ${JSON.stringify(p)}`);
}

t(safeNext(undefined) === "/", "a missing value is the home page");
t(safeNext(42) === "/", "a value that is not text is the home page");
t(safeNext("//x", "/login") === "/login", "the fallback is used when given");

console.log(`\n${checks} checks, ${bugs.length} bug${bugs.length === 1 ? "" : "s"}`);
if (bugs.length) process.exit(1);
