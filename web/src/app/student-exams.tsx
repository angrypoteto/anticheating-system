import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export type Row = {
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

/**
 * Everything this student has been set, from my_exams().
 *
 * It answers only for the caller, which is how the teacher's name reaches this
 * page at all — a student cannot read the users table, and opening a policy
 * wide enough to show a name would have shown the whole row.
 */
export async function loadMyExams(): Promise<{ rows: Row[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_exams");
  return { rows: (data ?? []) as Row[], error: error?.message ?? null };
}

/** Manila time, since that is where these exams are sat. */
const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Manila",
      })
    : null;

/** Just the clock, for a window that closes today. */
const clock = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-PH", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Manila",
      })
    : null;

/** The day, spelled out, for a line a student reads rather than scans. */
const longDay = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-PH", {
        day: "numeric",
        month: "long",
        timeZone: "Asia/Manila",
      })
    : null;

const isToday = (iso: string | null) => {
  if (!iso) return false;
  const fmt = new Intl.DateTimeFormat("en-PH", { dateStyle: "short", timeZone: "Asia/Manila" });
  return fmt.format(new Date(iso)) === fmt.format(new Date());
};

const duration = (m: number) => {
  if (!m) return "no time limit";
  if (m < 60) return `${m} minutes`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h} hour${h === 1 ? "" : "s"}`;
};

/** The heading over a band of the page. Small, spaced, and not a title. */
function Band({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-[13px] font-medium tracking-[0.08em] text-gray-500 uppercase">
      {children}
    </h2>
  );
}

/** Pass and fail carry a word as well as a colour, so neither stands alone. */
function Verdict({ passed }: { passed: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.75 py-1 text-xs font-medium whitespace-nowrap ${
        passed
          ? "border-green-200 bg-green-50 text-green-800"
          : "border-red-200 bg-red-50 text-red-800"
      }`}
    >
      {passed ? "Passed" : "Did not pass"}
    </span>
  );
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="h-3.75 w-3.75 shrink-0 -rotate-90 text-gray-500 transition group-open:rotate-0"
    >
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
 * A student's exams: the one that is open, then everything already sat.
 *
 * The open exam is not a row in a list. It is the reason the page was opened,
 * so it is a card of its own with the button on it — a student who has to
 * expand something to find "Start" is being asked to work out where the exam
 * is, which is not a question worth making them answer under time pressure.
 */
export function StudentExams({ rows, error }: { rows: Row[]; error: string | null }) {
  if (error) {
    return <p className="text-sm text-red-700">Could not load your exams: {error}</p>;
  }

  if (!rows.length) {
    return (
      <p className="text-sm text-gray-500">
        Nothing yet. An exam appears here once your teacher publishes one for
        you — usually by sending you a link.
      </p>
    );
  }

  const sat = rows.filter((r) => r.session_status && r.session_status !== "IN_PROGRESS");
  const open = rows.filter(
    (r) => r.is_open && (!r.session_status || r.session_status === "IN_PROGRESS"),
  );
  const waiting = rows.filter(
    (r) => !r.is_open && (!r.session_status || r.session_status === "IN_PROGRESS"),
  );

  return (
    <div>
      {open.length ? (
        <section>
          <Band>Open now</Band>
          <div className="space-y-3.5">
            {open.map((r) => {
              const started = r.session_status === "IN_PROGRESS";
              const closes = r.closes_at
                ? isToday(r.closes_at)
                  ? `closes ${clock(r.closes_at)} today`
                  : `closes ${longDay(r.closes_at)}, ${clock(r.closes_at)}`
                : null;
              const facts = [
                `${r.question_count} question${r.question_count === 1 ? "" : "s"}`,
                duration(r.total_minutes),
                closes,
              ].filter(Boolean);

              return (
                <div
                  key={r.exam_id}
                  className="flex flex-col gap-5 rounded-[14px] border border-teal-100 bg-white px-5.5 py-5.5 shadow-[0_1px_2px_rgba(13,21,36,0.04),0_8px_24px_-16px_rgba(13,21,36,0.25)] sm:flex-row sm:items-center sm:justify-between sm:gap-7 sm:px-7 sm:py-6.5"
                >
                  <div className="min-w-0">
                    <span className="mb-1.75 block text-[11px] font-medium tracking-[0.07em] text-accent uppercase">
                      {[r.subject, r.teacher].filter(Boolean).join(" · ")}
                    </span>
                    <p className="font-serif text-[19px] leading-[1.25] font-semibold tracking-tight text-gray-900 sm:text-[23px]">
                      {r.title}
                    </p>
                    <p className="mt-2 text-sm text-gray-500">
                      {facts.slice(0, 2).join(" · ")}
                      {closes ? (
                        <>
                          <span className="hidden sm:inline"> · </span>
                          <span className="block sm:inline">{closes}</span>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <Link
                    href={`/exam/${r.exam_id}`}
                    className="inline-flex h-12.5 shrink-0 items-center justify-center gap-2.25 rounded-[10px] bg-teal-700 px-6.5 text-[15px] font-medium text-white transition hover:bg-teal-800"
                  >
                    {started ? "Resume exam" : "Start exam"}
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M5 12h13m0 0-5.5-5.5M18 12l-5.5 5.5"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {waiting.length ? (
        <section className={open.length ? "mt-9.5" : ""}>
          <Band>Not open yet</Band>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            {waiting.map((r) => (
              <div
                key={r.exam_id}
                className="flex items-center gap-4.5 border-b border-gray-100 px-5.5 py-4 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-gray-900">{r.title}</span>
                  <span className="mt-[3px] block text-[12.5px] text-gray-500">
                    {[r.subject, r.teacher].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-[13px] text-gray-500">
                  {r.opens_at && new Date(r.opens_at) > new Date()
                    ? `opens ${when(r.opens_at)}`
                    : "closed"}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {sat.length ? (
        <section className={open.length || waiting.length ? "mt-9.5" : ""}>
          <Band>Your results</Band>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            {sat.map((r) => {
              const takenAt = r.submitted_at ?? r.started_at;
              const minutes =
                r.submitted_at && r.started_at
                  ? Math.max(
                      0,
                      Math.round(
                        (new Date(r.submitted_at).getTime() -
                          new Date(r.started_at).getTime()) /
                          60000,
                      ),
                    )
                  : null;

              return (
                <details key={r.exam_id} className="group border-b border-gray-100 last:border-b-0">
                  <summary className="flex cursor-pointer list-none items-center gap-4.5 px-5.5 py-4 hover:bg-gray-50">
                    <Chevron />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-gray-900">
                        {r.title}
                      </span>
                      <span className="mt-[3px] block truncate text-[12.5px] text-gray-500">
                        {[
                          r.subject,
                          r.teacher,
                          takenAt ? `taken ${longDay(takenAt)}, ${clock(takenAt)}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1.25 sm:flex-row sm:items-center sm:gap-4.5">
                      <span className="font-mono text-[15px] font-medium tabular-nums text-gray-900 sm:w-14 sm:text-right sm:text-[17px]">
                        {r.score != null ? `${r.score}%` : "—"}
                      </span>
                      <span className="flex justify-end sm:w-[78px]">
                        {r.passed == null ? (
                          <span className="text-[13px] text-gray-500">not marked</span>
                        ) : (
                          <Verdict passed={r.passed} />
                        )}
                      </span>
                    </span>
                  </summary>

                  <div className="grid grid-cols-2 gap-5 border-t border-gray-100 bg-gray-50/60 py-4.5 pr-5.5 pb-5 pl-14 sm:grid-cols-4">
                    <Detail label="Date taken">{when(takenAt) ?? "—"}</Detail>
                    <Detail label="Set by">{r.teacher}</Detail>
                    <Detail label="Score">
                      {r.score != null ? (
                        <>
                          {r.score}%{" "}
                          <span className="text-gray-500">· pass mark {Number(r.pass_mark)}%</span>
                        </>
                      ) : (
                        "Not marked yet"
                      )}
                    </Detail>
                    <Detail label="Time taken">
                      {minutes != null
                        ? `${minutes} of ${r.total_minutes || "—"} minutes`
                        : "—"}
                    </Detail>
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
