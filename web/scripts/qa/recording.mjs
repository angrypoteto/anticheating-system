/**
 * Where a flag lands in a screen recording.
 *
 * The recording reaches the teacher as thirty-second pieces whose place in the
 * sitting is written in their names. If a name is misread, or a moment is
 * looked up in the wrong piece, "Watch" plays the wrong half-minute — and the
 * teacher voids, or keeps, a flag on the strength of footage that is not of it.
 * Nothing here touches a browser or the database; it drives the arithmetic.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));

const { segmentName, parseSegmentName, locateMoment } = await import(
  new URL("../../src/lib/screen-recorder.ts", import.meta.url).href
);

let checks = 0;
const bugs = [];
const ok = (l, d = "") => { checks++; console.log(`  ok   ${l}${d ? " — " + d : ""}`); };
const bug = (l, d = "") => { checks++; bugs.push({ l, d }); console.log(`  BUG  ${l}${d ? " — " + d : ""}`); };
const t = (c, l, d = "") => (c ? ok(l, d) : bug(l, d));
const head = (n) => console.log(`\n== ${n} ==`);

const REC = "3f2b8a10-6c1d-4e7a-9b55-0a1b2c3d4e5f";

head("A piece's name round-trips");
{
  const name = segmentName(REC, 7, 210_431, 30_012, "webm");
  const back = parseSegmentName(name);
  t(name === `${REC}_00007_210431_30012.webm`, "the name is recording, padded sequence, offset, duration", name);
  t(back?.recordingId === REC, "the recording is read back");
  t(back?.seq === 7 && back?.offsetMs === 210_431 && back?.durationMs === 30_012, "sequence, offset and duration are read back");

  // The first piece can begin a hair before the anchor: the anchor is the
  // midpoint of a round trip, and the recorder starts at its end.
  const early = parseSegmentName(segmentName(REC, 0, -42, 30_000, "mp4"));
  t(early?.offsetMs === -42, "a negative offset survives", String(early?.offsetMs));

  t(parseSegmentName("notes.txt") === null, "a stray file is ignored");
  t(parseSegmentName(`${REC}_00001_10_20.mov`) === null, "an unknown format is ignored");
  t(parseSegmentName(`../${REC}_00001_10_20.webm`) === null, "a path is not a name");
}

head("A moment is found in the right piece");
{
  // Two recordings: 0–60s in two pieces, then a gap (they stopped sharing),
  // then 90–120s.
  const pieces = [
    { startMs: 0, durationMs: 30_000 },
    { startMs: 30_000, durationMs: 30_000 },
    { startMs: 90_000, durationMs: 30_000 },
  ];

  let r = locateMoment(pieces, 12_500);
  t(r.index === 0 && r.seconds === 12.5, "inside the first piece", JSON.stringify(r));

  r = locateMoment(pieces, 30_000);
  t(r.index === 1 && r.seconds === 0, "a piece's first instant belongs to it, not the one before", JSON.stringify(r));

  r = locateMoment(pieces, 59_999);
  t(r.index === 1 && Math.abs(r.seconds - 29.999) < 1e-9, "the last instant of a piece", JSON.stringify(r));

  r = locateMoment(pieces, 75_000);
  t(r.index === 2 && r.seconds === 0, "a moment in a gap plays what comes next", JSON.stringify(r));

  r = locateMoment(pieces, -5_000);
  t(r.index === 0 && r.seconds === 0, "before the recording starts at its start", JSON.stringify(r));

  r = locateMoment(pieces, 500_000);
  t(r.index === 2 && r.seconds === 30, "after the end stops at the end, not past it", JSON.stringify(r));

  // "Watch" starts five seconds early. A flag four seconds into the second
  // recording must not be sent back into the gap and then to the wrong piece.
  r = locateMoment(pieces, 94_000 - 5_000);
  t(r.index === 2 && r.seconds === 0, "a lead-in that falls into a gap still lands on the flag's piece", JSON.stringify(r));
}

console.log(`\n${checks} checks, ${bugs.length} bug${bugs.length === 1 ? "" : "s"}`);
if (bugs.length) process.exit(1);
