import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type Row = {
  exam_id: string;
  title: string;
  teacher: string;
  total_minutes: number;
  question_count: number;
  session_status: string | null;
  started_at: string | null;
  submitted_at: string | null;
  score: number | null;
  pass_mark: number;
  passed: boolean | null;
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
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-800 ring-1 ring-green-200 dark:bg-green-950/60 dark:text-green-300 dark:ring-green-900">
      <span aria-hidden>✓</span> Passed
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800 ring-1 ring-red-200 dark:bg-red-950/60 dark:text-red-300 dark:ring-red-900">
      <span aria-hidden>✕</span> Failed
    </span>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
      {children}
    </span>
  );
}

function Chevron() {
  return (
    <span
      aria-hidden
      className="shrink-0 text-gray-400 transition group-open:rotate-90 dark:text-gray-500"
    >
      ›
    </span>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-gray-900 dark:text-gray-100">{children}</dd>
    </div>
  );
}

function ScoreBar({ score, passMark }: { score: number; passMark: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-50">
          {score}%
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          pass mark {passMark}%
        </span>
      </div>
      {/* The bar repeats the number rather than replacing it — the figure is the
          fact, the bar only places it against the pass mark, drawn as a tick. */}
      <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
        <div
          className={`h-full rounded-full ${
            score >= passMark ? "bg-green-600 dark:bg-green-500" : "bg-red-600 dark:bg-red-500"
          }`}
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        />
        <div
          aria-hidden
          className="absolute inset-y-0 w-px bg-gray-500 dark:bg-gray-400"
          style={{ left: `${Math.max(0, Math.min(100, passMark))}%` }}
        />
      </div>
    </div>
  );
}

const rowClass =
  "group rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900";
const summaryClass =
  "flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50";
const panelClass =
  "border-t border-gray-100 px-4 py-4 dark:border-gray-800";

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
      <p className="mt-2 text-sm text-red-600 dark:text-red-400">
        Could not load your exams: {error.message}
      </p>
    );
  }

  const rows = (data ?? []) as Row[];
  const done = rows.filter((r) => r.session_status && r.session_status !== "IN_PROGRESS");
  const todo = rows.filter((r) => !r.session_status || r.session_status === "IN_PROGRESS");

  if (!rows.length) {
    return (
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Nothing yet. An exam appears here once your teacher publishes one for
        you — usually by sending you a link.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-6">
      {todo.length ? (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            To take · {todo.length}
          </h3>
          <ul className="mt-2 space-y-2">
            {todo.map((r) => {
              const started = r.session_status === "IN_PROGRESS";
              return (
                <li key={r.exam_id} className={rowClass}>
                  <details>
                    <summary className={summaryClass}>
                      <span className="min-w-0 truncate font-medium text-gray-900 dark:text-gray-100">
                        {r.title}
                      </span>
                      <span className="flex items-center gap-2">
                        <Chip>{started ? "In progress" : "Not started"}</Chip>
                        <Chevron />
                      </span>
                    </summary>

                    <div className={panelClass}>
                      <dl className="grid gap-4 sm:grid-cols-3">
                        <Detail label="Set by">{r.teacher}</Detail>
                        <Detail label="Questions">{r.question_count}</Detail>
                        <Detail label="Time allowed">{duration(r.total_minutes)}</Detail>
                      </dl>
                      <Link
                        href={`/exam/${r.exam_id}`}
                        className="mt-4 inline-block rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
                      >
                        {started ? "Resume exam" : "Start exam"}
                      </Link>
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
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Results · {done.length}
          </h3>
          <ul className="mt-2 space-y-2">
            {done.map((r) => (
              <li key={r.exam_id} className={rowClass}>
                <details>
                  <summary className={summaryClass}>
                    <span className="min-w-0 truncate font-medium text-gray-900 dark:text-gray-100">
                      {r.title}
                    </span>
                    <span className="flex items-center gap-2">
                      {r.score != null ? (
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                          {r.score}%
                        </span>
                      ) : null}
                      {r.passed == null ? <Chip>Not marked yet</Chip> : <Verdict passed={r.passed} />}
                      <Chevron />
                    </span>
                  </summary>

                  <div className={`${panelClass} space-y-4`}>
                    <dl className="grid gap-4 sm:grid-cols-2">
                      <Detail label="Set by">{r.teacher}</Detail>
                      <Detail label="Taken">
                        {when(r.submitted_at) ?? when(r.started_at) ?? "—"}
                      </Detail>
                    </dl>

                    {r.session_status === "AUTO_SUBMITTED" ? (
                      <p className="text-sm text-amber-800 dark:text-amber-300">
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
