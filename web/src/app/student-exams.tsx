import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type Row = {
  exam_id: string;
  title: string;
  subject: string | null;
  teacher: string;
  total_minutes: number;
  question_count: number;
  session_status: string | null;
  started_at: string | null;
  submitted_at: string | null;
  score: number | null;
  pass_mark: number;
  passed: boolean | null;
  opens_at: string | null;
  closes_at: string | null;
  is_open: boolean;
};

/** Manila time, since that is where these exams are sat. */
const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Manila",
      })
    : null;

const duration = (m: number) => {
  if (!m) return "no time limit";
  if (m < 60) return `${m} minutes`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h} hour${h === 1 ? "" : "s"}`;
};

/** Pass and fail carry a mark and a word, never colour alone. */
function Verdict({ passed }: { passed: boolean }) {
  return passed ? (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300">
      <span aria-hidden>✓</span> Passed
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300">
      <span aria-hidden>✕</span> Failed
    </span>
  );
}

function Chip({ tone = "muted", children }: { tone?: "muted" | "brand" | "warn"; children: React.ReactNode }) {
  const cls =
    tone === "brand"
      ? "bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-300"
      : tone === "warn"
        ? "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-500/10 dark:text-amber-300"
        : "bg-slate-100 text-slate-600 ring-slate-600/10 dark:bg-slate-800 dark:text-slate-300";
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${cls}`}>
      {children}
    </span>
  );
}

function Chevron() {
  return (
    <span
      aria-hidden
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition group-open:rotate-90 group-open:bg-indigo-600 group-open:text-white dark:bg-slate-800 dark:text-slate-500"
    >
      ›
    </span>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{children}</dd>
    </div>
  );
}

function ScoreBar({ score, passMark }: { score: number; passMark: number }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200/60 dark:bg-slate-800/50 dark:ring-slate-700/50">
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-white">
          {score}%
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          pass mark {passMark}%
        </span>
      </div>
      <div className="relative mt-2.5 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-full rounded-full transition-all ${
            score >= passMark
              ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
              : "bg-gradient-to-r from-rose-500 to-rose-400"
          }`}
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        />
        <div
          aria-hidden
          className="absolute inset-y-0 w-0.5 bg-slate-900 dark:bg-white"
          style={{ left: `${Math.max(0, Math.min(100, passMark))}%` }}
        />
      </div>
    </div>
  );
}

const rowClass =
  "group overflow-hidden rounded-2xl border border-slate-200/80 bg-white transition hover:border-slate-300 hover:shadow-[0_8px_24px_-12px_rgb(15_23_42/0.2)] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700";
const summaryClass =
  "flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden";
const panelClass =
  "border-t border-slate-100 bg-slate-50/60 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/40";

/**
 * A student's exams, as a plain list that opens.
 *
 * Collapsed, a row is the title and where it stands; the teacher, the timing
 * and the score live inside, so a term's worth of exams stays readable. All of
 * it comes from my_exams(), which answers only for the caller — the teacher's
 * name is not otherwise readable by a student, and reaching it through a policy
 * would have exposed the teacher's whole row.
 */
export async function StudentExams() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_exams");

  if (error) {
    return (
      <p className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300">
        Could not load your exams: {error.message}
      </p>
    );
  }

  const rows = (data ?? []) as Row[];
  const done = rows.filter((r) => r.session_status && r.session_status !== "IN_PROGRESS");
  const todo = rows.filter((r) => !r.session_status || r.session_status === "IN_PROGRESS");

  if (!rows.length) {
    return (
      <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-5 py-8 text-center dark:border-slate-700 dark:bg-slate-800/30">
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Nothing yet. An exam appears here once your teacher publishes one for
          you — usually by sending you a link.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-6">
      {todo.length ? (
        <section>
          <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            To take
            <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white">
              {todo.length}
            </span>
          </h3>
          <ul className="mt-2.5 space-y-2.5">
            {todo.map((r) => {
              const started = r.session_status === "IN_PROGRESS";
              const notYet = r.opens_at && new Date(r.opens_at).getTime() > Date.now();
              const over = r.closes_at && new Date(r.closes_at).getTime() <= Date.now();
              return (
                <li key={r.exam_id} className={rowClass}>
                  <details>
                    <summary className={summaryClass}>
                      <span className="flex min-w-0 items-center gap-3">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold ${started ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" : "bg-indigo-600/10 text-indigo-700 dark:text-indigo-300"}`}>
                          {r.title[0]?.toUpperCase() ?? "E"}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold tracking-tight text-slate-900 dark:text-white">
                            {r.title}
                          </span>
                          {r.subject ? (
                            <span className="block truncate text-xs font-medium text-indigo-600 dark:text-indigo-400">
                              {r.subject}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <Chip tone={over ? "muted" : started ? "warn" : "brand"}>
                          {over
                            ? "Closed"
                            : notYet
                              ? "Opens later"
                              : started
                                ? "In progress"
                                : "Not started"}
                        </Chip>
                        <Chevron />
                      </span>
                    </summary>

                    <div className={panelClass}>
                      <dl className="grid gap-4 sm:grid-cols-3">
                        {r.subject ? <Detail label="Subject">{r.subject}</Detail> : null}
                        <Detail label="Set by">{r.teacher}</Detail>
                        <Detail label="Questions">{r.question_count}</Detail>
                        <Detail label="Time allowed">{duration(r.total_minutes)}</Detail>
                        {r.opens_at ? (
                          <Detail label="Opens">{when(r.opens_at)}</Detail>
                        ) : null}
                        {r.closes_at ? (
                          <Detail label="Closes">{when(r.closes_at)}</Detail>
                        ) : null}
                      </dl>
                      {r.is_open ? (
                        <Link
                          href={`/exam/${r.exam_id}`}
                          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgb(79_70_229/0.6)] transition hover:bg-indigo-700"
                        >
                          {started ? "Resume exam →" : "Start exam →"}
                        </Link>
                      ) : (
                        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
                          {over
                            ? "This exam has closed."
                            : `You can start it from ${when(r.opens_at)}.`}
                        </p>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {done.length ? (
        <section>
          <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Results
            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[11px] font-bold leading-none text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              {done.length}
            </span>
          </h3>
          <ul className="mt-2.5 space-y-2.5">
            {done.map((r) => (
              <li key={r.exam_id} className={rowClass}>
                <details>
                  <summary className={summaryClass}>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold tracking-tight text-slate-900 dark:text-white">
                        {r.title}
                      </span>
                      {r.subject ? (
                        <span className="block truncate text-xs font-medium text-indigo-600 dark:text-indigo-400">
                          {r.subject}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-2">
                      {r.score != null ? (
                        <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-sm font-bold tabular-nums text-slate-900 dark:bg-slate-800 dark:text-white">
                          {r.score}%
                        </span>
                      ) : null}
                      {r.passed == null ? <Chip>Not marked yet</Chip> : <Verdict passed={r.passed} />}
                      <Chevron />
                    </span>
                  </summary>

                  <div className={`${panelClass} space-y-4`}>
                    <dl className="grid gap-4 sm:grid-cols-2">
                      {r.subject ? <Detail label="Subject">{r.subject}</Detail> : null}
                      <Detail label="Set by">{r.teacher}</Detail>
                      <Detail label="Taken">
                        {when(r.submitted_at) ?? when(r.started_at) ?? "—"}
                      </Detail>
                    </dl>

                    {r.session_status === "AUTO_SUBMITTED" ? (
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300">
                        Submitted automatically when the time ran out.
                      </p>
                    ) : null}

                    {r.score != null ? (
                      <ScoreBar score={r.score} passMark={Number(r.pass_mark)} />
                    ) : null}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
