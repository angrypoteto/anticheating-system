import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseTimer } from "@/lib/exam-config";
import { classLabel } from "@/lib/classes";
import { classesEnabled } from "@/lib/settings";
import { siteUrl } from "@/lib/site-url";
import { DeleteExam } from "./delete-exam";
import { CloseExam } from "./close-exam";

/**
 * The publishing state is a word, not a colour.
 *
 * The row already carries one coloured thing — the window pill — and that is
 * the state a teacher acts on. Painting "published" green beside a grey
 * "Closed" pill made the row argue with itself: two colours, two meanings,
 * neither obviously the one to read. So this stays grey and sits in a fixed
 * column, where it is scanned down rather than read across.
 */
const STATUS_WORD = "w-[74px] shrink-0 text-right text-[13px] text-gray-500";

/**
 * Whether a published exam can be sat *right now*.
 *
 * "Published" and "open" are not the same thing, and the row only ever said
 * "published" — so an exam that closed hours ago looked identical to one a class
 * was sitting, and the only way to tell was to expand it and read a date. This
 * is the state a teacher actually acts on, so it belongs where they can see it
 * without opening anything.
 */
const WINDOW_STYLES: Record<string, string> = {
  open: "border-green-200 bg-green-50 text-green-800",
  closed: "border-gray-200 bg-gray-100 text-gray-700",
  scheduled: "border-amber-200 bg-amber-50 text-amber-900",
};

/** Sentence case, because it is a state being reported and not a tag. */
const WINDOW_WORDS: Record<string, string> = {
  open: "Open",
  closed: "Closed",
  scheduled: "Scheduled",
};

/** Manila time, since that is where the exams are actually sat. */
const when = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Manila",
      })
    : null;

const duration = (minutes: number) => {
  if (!minutes) return "No time limit";
  if (minutes < 60) return `${minutes} minutes`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h} hour${h === 1 ? "" : "s"}`;
};

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-[0.07em] text-gray-500 uppercase">
        {label}
      </dt>
      <dd className="mt-1.25 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

/**
 * The list of exams already made, shared by the standalone /exams screen and
 * /admin/exams. Each row opens in place — who set it, which classes sit it and
 * when — so you can check an exam without leaving the list to open the editor.
 */
export async function ExamList() {
  await requireRole("INSTRUCTOR", "ADMIN");
  const supabase = await createClient();

  const [
    { data: exams },
    { data: sections },
    { data: people },
    { data: questions },
    { data: sittings },
  ] = await Promise.all([
    supabase
      .from("exams")
      .select(
        "id, title, status, section_id, created_at, published_at, timer_config, created_by_id, share_token, opens_at, closes_at, subjects(name), exam_sections(section_id)",
      )
      .order("created_at", { ascending: false }),
    supabase.from("sections").select("id, name, subject"),
    supabase.from("users").select("id, full_name, email"),
    // How long an exam is and how many sat it are the two things a teacher
    // picks a row by, and both were only visible after opening one.
    supabase.from("questions").select("exam_id"),
    supabase.from("exam_sessions").select("exam_id"),
  ]);

  const tally = (rows: { exam_id: string }[] | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.exam_id, (m.get(r.exam_id) ?? 0) + 1);
    return m;
  };
  const questionCount = tally(questions);
  const sittingCount = tally(sittings);

  const sectionName = new Map((sections ?? []).map((s) => [s.id, classLabel(s)]));
  const useClasses = await classesEnabled();
  const base = await siteUrl();
  const personName = new Map(
    (people ?? []).map((p) => [p.id, p.full_name || p.email]),
  );

  if (!exams?.length) {
    return (
      <p className="p-6 text-sm text-gray-500 dark:text-gray-400">
        Nothing made yet. Generate your first exam or quiz to see it here.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
      {exams.map((e) => {
        // An exam is delivered to every class in exam_sections; section_id is
        // the class it was first built for, and older exams only have that.
        const ids = new Set<string>(
          (e.exam_sections ?? []).map((t: { section_id: string }) => t.section_id),
        );
        if (e.section_id) ids.add(e.section_id);
        const classes = [...ids].map((id) => sectionName.get(id) ?? "unknown class");
        const timer = parseTimer(e.timer_config);
        const published = when(e.published_at);
        const nowMs = Date.now();
        const notYet = e.opens_at && new Date(e.opens_at).getTime() > nowMs;
        const over = e.closes_at && new Date(e.closes_at).getTime() <= nowMs;
        // PostgREST types a to-one embed as an array; accept either.
        const subjectEmbed = e.subjects as { name: string } | { name: string }[] | null;
        const subject = (Array.isArray(subjectEmbed) ? subjectEmbed[0] : subjectEmbed)?.name ?? null;
        // Only a published exam has a window worth reporting; a draft is not
        // closed, it simply has not started existing yet.
        const windowState =
          e.status !== "PUBLISHED"
            ? null
            : over
              ? "closed"
              : notYet
                ? "scheduled"
                : "open";
        // Class, length, turnout — the three things a row is chosen by.
        const asked = questionCount.get(e.id) ?? 0;
        const sat = sittingCount.get(e.id) ?? 0;
        const scanline = [
          useClasses ? (classes.length ? classes.join(", ") : "No class assigned") : null,
          `${asked} question${asked === 1 ? "" : "s"}`,
          e.status === "PUBLISHED" ? `${sat} sitting${sat === 1 ? "" : "s"}` : "not published",
        ]
          .filter(Boolean)
          .join(" · ");

        const availability =
          e.status !== "PUBLISHED"
            ? null
            : over
              ? `Closed ${when(e.closes_at)}`
              : notYet
                ? `Opens ${when(e.opens_at)}`
                : e.closes_at
                  ? `Open until ${when(e.closes_at)}`
                  : "Open";

        return (
          <li key={e.id}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-4.5 px-6 py-[17px] hover:bg-gray-50">
                <div className="min-w-0 flex-1">
                  {/* The subject is a kicker: it says what this belongs to, so it
                      is read before the name and not mistaken for part of it. */}
                  {subject ? (
                    <p className="truncate text-xs font-medium tracking-[0.06em] text-accent uppercase">
                      {subject}
                    </p>
                  ) : null}
                  <p className="truncate text-[15.5px] font-medium tracking-[-0.005em] text-gray-900">
                    {e.title}
                  </p>
                  <p className="mt-1 truncate text-[13px] text-gray-500">{scanline}</p>
                </div>
                {windowState ? (
                  <span
                    title={availability ?? undefined}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.75 py-1 text-xs font-medium ${WINDOW_STYLES[windowState]}`}
                  >
                    {windowState === "open" ? (
                      <span aria-hidden className="h-1.75 w-1.75 rounded-full bg-current" />
                    ) : null}
                    {WINDOW_WORDS[windowState]}
                  </span>
                ) : null}
                <span className={STATUS_WORD}>{e.status.toLowerCase()}</span>
                <svg
                  aria-hidden
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="shrink-0 -rotate-90 text-gray-500 transition group-open:rotate-0"
                >
                  <path
                    d="m6 9 6 6 6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </summary>

              <div className="border-t border-gray-100 bg-gray-50/60 px-6 pt-3.5 pb-5.5">
                <dl className="grid gap-4.5 gap-x-10 sm:grid-cols-2">
                  {subject ? <Detail label="Subject">{subject}</Detail> : null}

                  {useClasses ? (
                  <Detail label="Given to">
                    {classes.length ? (
                      <ul className="space-y-0.5">
                        {classes.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-gray-500 dark:text-gray-400">
                        Not assigned to a class yet
                      </span>
                    )}
                  </Detail>
                  ) : null}

                  <Detail label="Set by">
                    {personName.get(e.created_by_id) ?? (
                      <span className="text-gray-500 dark:text-gray-400">Unknown</span>
                    )}
                  </Detail>

                  <Detail label="Time allowed">
                    {duration(timer.totalMinutes)}
                    {timer.perQuestionSeconds ? (
                      <span className="text-gray-500 dark:text-gray-400">
                        {" "}
                        · {timer.perQuestionSeconds}s per question
                      </span>
                    ) : null}
                  </Detail>

                  {availability ? (
                    <Detail label="Availability">{availability}</Detail>
                  ) : null}

                  <Detail label="Student link">
                    {e.status === "PUBLISHED" ? (
                      <a
                        href={`${base}/e/${e.share_token}`}
                        className="break-all font-mono text-xs text-teal-700 underline underline-offset-4 dark:text-teal-400"
                      >
                        {`${base}/e/${e.share_token}`}
                      </a>
                    ) : (
                      <span className="text-gray-500 dark:text-gray-400">
                        Publish it to hand out the link
                      </span>
                    )}
                  </Detail>

                  <Detail label={published ? "Given on" : "Not yet given"}>
                    {published ?? (
                      <span className="text-gray-500 dark:text-gray-400">
                        Made {when(e.created_at)} — publish it to send it out
                      </span>
                    )}
                  </Detail>
                </dl>

                <div className="mt-5 flex flex-wrap items-center gap-4.5 border-t border-gray-100 pt-4 text-[13.5px]">
                  <Link
                    href={`/exams/${e.id}`}
                    className="border-b border-teal-100 pb-px text-teal-700 hover:border-teal-700"
                  >
                    Open editor
                  </Link>
                  {e.status === "PUBLISHED" ? (
                    <Link
                      href={`/exams/${e.id}/monitor?from=list`}
                      className="border-b border-teal-100 pb-px text-teal-700 hover:border-teal-700"
                    >
                      {/* Nothing is live once it has closed — the same page is
                          then a record of what happened, and calling it "watch"
                          invites a teacher to go looking for movement. */}
                      {over ? "Records" : "Watch it live"}
                    </Link>
                  ) : null}
                  {windowState === "open" ? <CloseExam examId={e.id} /> : null}
                  <span className="ml-auto">
                    <DeleteExam examId={e.id} title={e.title} stay />
                  </span>
                </div>
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
