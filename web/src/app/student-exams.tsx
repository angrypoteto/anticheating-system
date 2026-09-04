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

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{children}</p>
  );
}

/** The pass/fail badge — never colour alone, so it survives a colourblind reader. */
function Verdict({ passed }: { passed: boolean }) {
  return passed ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-800 ring-1 ring-green-200 dark:bg-green-950/60 dark:text-green-300 dark:ring-green-900">
      <span aria-hidden>✓</span> Passed
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800 ring-1 ring-red-200 dark:bg-red-950/60 dark:text-red-300 dark:ring-red-900">
      <span aria-hidden>✕</span> Failed
    </span>
  );
}

function ScoreBar({ score, passMark }: { score: number; passMark: number }) {
  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-50">
          {score}%
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          pass mark {passMark}%
        </span>
      </div>
      {/* The bar repeats the number rather than replacing it — the figure is the
          fact, the bar is only there to show it against the pass mark. */}
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

/**
 * A student's exams, split by what they can act on.
 *
 * Everything comes from my_exams(), which answers only for the caller — the
 * teacher's name is not otherwise readable by a student, and reaching it
 * through a policy would have exposed the teacher's whole row.
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
    <div className="mt-4 space-y-8">
      {todo.length ? (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            To take
          </h3>
          <ul className="mt-3 space-y-2">
            {todo.map((r) => {
              const started = r.session_status === "IN_PROGRESS";
              return (
                <li
                  key={r.exam_id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{r.title}</p>
                    <Meta>
                      {r.teacher} · {r.question_count} question
                      {r.question_count === 1 ? "" : "s"} · {duration(r.total_minutes)}
                      {started ? " · in progress" : ""}
                    </Meta>
                  </div>
                  <Link
                    href={`/exam/${r.exam_id}`}
                    className="shrink-0 rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
                  >
                    {started ? "Resume" : "Start"}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {done.length ? (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Results
          </h3>
          <ul className="mt-3 space-y-3">
            {done.map((r) => (
              <li
                key={r.exam_id}
                className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{r.title}</p>
                    <Meta>
                      {r.teacher} · taken {when(r.submitted_at) ?? when(r.started_at)}
                      {r.session_status === "AUTO_SUBMITTED"
                        ? " · submitted automatically when time ran out"
                        : ""}
                    </Meta>
                  </div>
                  {r.passed == null ? (
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      Not marked yet
                    </span>
                  ) : (
                    <Verdict passed={r.passed} />
                  )}
                </div>

                {r.score != null ? (
                  <ScoreBar score={r.score} passMark={Number(r.pass_mark)} />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
