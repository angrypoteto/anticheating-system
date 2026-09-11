"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  allowRetake,
  extendSitting,
  forceSubmit,
  voidAllFlags,
  voidFlag,
  type MonitorState,
} from "./actions";

export type SessionRow = {
  id: string;
  student_id: string;
  status: string;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  /** While this is in the future, this student may answer a closed exam. */
  reopened_until: string | null;
};

export type FlagRow = {
  id: string;
  session_id: string;
  type: string;
  strike_number: number;
  occurred_at: string;
  resolution: string | null;
  question_id: string | null;
  /** What was seen, for flags that carry more than a type (an extension's id). */
  detail?: string | null;
};

/**
 * The four questions a teacher actually asks of a class list, in the order they
 * ask them. "Flagged" is first among the narrowing ones because it is the whole
 * reason for watching: with fifty rows on screen, the four that need attention
 * are not findable by reading.
 */
const FILTERS = [
  { id: "all", label: "All" },
  { id: "flagged", label: "Flagged" },
  { id: "in-progress", label: "In progress" },
  { id: "submitted", label: "Submitted" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

const FLAG_LABELS: Record<string, string> = {
  TAB_SWITCH: "switched tab",
  FULLSCREEN_EXIT: "left fullscreen",
  WINDOW_BLUR: "window lost focus",
  HONEYPOT: "honeypot triggered",
  SCREEN_SHARE_ENDED: "stopped sharing screen",
  EXTENSION_DETECTED: "browser extension on the page",
};

export function LiveMonitor({
  examId,
  initialSessions,
  initialFlags,
  studentNames,
  studentClasses,
  classOptions,
  questionLabels,
  answeredBySession,
  askedCount,
  recordsScreens = false,
  recordedSessions = [],
}: {
  examId: string;
  initialSessions: SessionRow[];
  initialFlags: FlagRow[];
  studentNames: Record<string, string>;
  /** Section ids per student — only the classes this teacher may see. */
  studentClasses: Record<string, string[]>;
  /** Classes somebody sitting this exam is actually in. Empty when classes are off. */
  classOptions: { id: string; label: string }[];
  questionLabels: Record<string, string>;
  /** Answers recorded per sitting, so a live row can say how far through it is. */
  answeredBySession: Record<string, number>;
  askedCount: number;
  /** The exam asks students to share their screen. */
  recordsScreens?: boolean;
  /** Sittings with at least one recording, whatever the exam asks now. */
  recordedSessions?: string[];
}) {
  const [sessions, setSessions] = useState(initialSessions);
  const [flags, setFlags] = useState(initialFlags);
  const [toast, setToast] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [klass, setKlass] = useState("all");
  const supabase = useRef(createClient());

  useEffect(() => {
    const client = supabase.current;
    const known = new Set(initialSessions.map((s) => s.id));

    // RLS applies to Realtime too, so this only ever delivers rows for sessions
    // in this instructor's own sections.
    const channel = client
      .channel(`monitor:${examId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "flags" },
        (payload) => {
          const row = (payload.new ?? payload.old) as FlagRow;
          if (!row?.session_id || !known.has(row.session_id)) return;

          setFlags((prev) => {
            const rest = prev.filter((f) => f.id !== row.id);
            return payload.eventType === "DELETE" ? rest : [row, ...rest];
          });

          if (payload.eventType === "INSERT") {
            const who = studentNames[
              initialSessions.find((s) => s.id === row.session_id)?.student_id ?? ""
            ];
            setToast(`${who ?? "A student"}: ${FLAG_LABELS[row.type] ?? row.type}`);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "exam_sessions" },
        (payload) => {
          const row = payload.new as SessionRow;
          if (!row?.id) return;
          known.add(row.id);
          setSessions((prev) => {
            const i = prev.findIndex((s) => s.id === row.id);
            if (i === -1) return [...prev, row];
            const copy = [...prev];
            copy[i] = { ...copy[i], ...row };
            return copy;
          });
        },
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
        // Anything that happened while the socket was down never arrives as an
        // event, so reconcile against the database on every (re)connect rather
        // than trusting the stream to be gap-free.
        if (status === "SUBSCRIBED") void reconcile();
      });

    async function reconcile() {
      const { data: freshSessions } = await client
        .from("exam_sessions")
        .select("id, student_id, status, started_at, submitted_at, score, reopened_until")
        .eq("exam_id", examId)
        .order("started_at");
      if (!freshSessions) return;

      for (const s of freshSessions) known.add(s.id);
      setSessions(freshSessions as SessionRow[]);

      const ids = freshSessions.map((s) => s.id);
      if (!ids.length) return;

      const { data: freshFlags } = await client
        .from("flags")
        .select("id, session_id, type, strike_number, occurred_at, resolution, question_id, detail")
        .in("session_id", ids)
        .order("occurred_at", { ascending: false });
      if (freshFlags) setFlags(freshFlags as FlagRow[]);
    }

    return () => {
      client.removeChannel(channel);
    };
  }, [examId, initialSessions, studentNames]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  const flagsBySession = new Map<string, FlagRow[]>();
  for (const f of flags) {
    const list = flagsBySession.get(f.session_id) ?? [];
    list.push(f);
    flagsBySession.set(f.session_id, list);
  }

  // Matching on the email as well as the name: an account that has not been
  // given a name is shown by its address, and searching for what is on screen
  // has to find it.
  const needle = query.trim().toLowerCase();
  const openFlags = (id: string) =>
    (flagsBySession.get(id) ?? []).filter((f) => f.resolution == null).length;

  // Who is on screen before the status filter narrows it further, so the counts
  // beside "Flagged" and the rest describe the class being looked at rather than
  // the whole exam.
  const inScope = sessions.filter((s) => {
    const who = (studentNames[s.student_id] ?? s.student_id).toLowerCase();
    if (needle && !who.includes(needle)) return false;
    if (klass === "all") return true;
    const mine = studentClasses[s.student_id] ?? [];
    // Somebody reached this paper by its share link and is in no class of this
    // teacher's; "No class" is the only honest place to put them.
    return klass === "none" ? mine.length === 0 : mine.includes(klass);
  });

  const shown = inScope.filter((s) => {
    if (filter === "flagged") return openFlags(s.id) > 0;
    if (filter === "in-progress") return s.status === "IN_PROGRESS";
    if (filter === "submitted") return s.status !== "IN_PROGRESS";
    return true;
  });

  const unplaced = classOptions.length
    ? sessions.some((s) => (studentClasses[s.student_id] ?? []).length === 0)
    : false;

  const inProgress = sessions.filter((s) => s.status === "IN_PROGRESS");
  const autoSubmitted = sessions.filter((s) => s.status === "AUTO_SUBMITTED").length;
  const openFlagCount = flags.filter((f) => f.resolution == null).length;
  const flaggedStudents = new Set(
    flags
      .filter((f) => f.resolution == null)
      .map((f) => sessions.find((x) => x.id === f.session_id)?.student_id)
      .filter(Boolean),
  ).size;
  const submitted = sessions.filter((s) => s.status !== "IN_PROGRESS");
  const scored = submitted.filter((s) => s.score != null);
  const average = scored.length
    ? Math.round((scored.reduce((n, s) => n + (s.score ?? 0), 0) / scored.length) * 100) / 100
    : null;

  return (
    <div className="space-y-8">
      {toast ? (
        <div
          role="status"
          className="fixed right-6 top-6 z-50 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        >
          {toast}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat
          label="In progress"
          value={String(inProgress.length)}
          note={`of ${sessions.length} sitting${sessions.length === 1 ? "" : "s"}`}
        />
        <Stat
          label="Submitted"
          value={String(submitted.length)}
          note={
            autoSubmitted
              ? `${autoSubmitted} auto-submitted`
              : undefined
          }
        />
        <Stat
          label="Open flags"
          value={String(openFlagCount)}
          tone={openFlagCount ? "warn" : undefined}
          note={
            openFlagCount
              ? `across ${flaggedStudents} student${flaggedStudents === 1 ? "" : "s"}`
              : undefined
          }
        />
        <Stat
          label="Average"
          value={average != null ? `${average}%` : "—"}
          note={scored.length ? "of those submitted" : undefined}
        />
      </div>

      <ClearAllFlags examId={examId} open={flags.filter((f) => f.resolution == null).length} />

      <p className="flex items-center gap-2 text-[13px] text-gray-700">
        <span
          aria-hidden
          className={`h-2 w-2 rounded-full ${
            connected ? "bg-green-700 ring-3 ring-green-50" : "bg-gray-300 ring-3 ring-gray-100"
          }`}
        />
        {connected ? "Live. Updates stream in as they happen." : "Connecting…"}
      </p>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-4 px-6 pt-5 pb-4">
            <h2 className="text-[17px] font-semibold tracking-tight text-gray-900">
              Students
            </h2>
            {sessions.length ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {shown.length === sessions.length
                  ? `${sessions.length} sitting${sessions.length === 1 ? "" : "s"}`
                  : `${shown.length} of ${sessions.length}`}
              </p>
            ) : null}
          </div>

          {sessions.length ? (
            <div className="flex flex-wrap items-center gap-3 border-y border-gray-100 bg-gray-50/60 px-6 py-4">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or email"
                aria-label="Search students"
                className="h-9.5 min-w-60 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-teal-600 focus:ring-3 focus:ring-teal-600/12"
              />
              {classOptions.length ? (
                <select
                  value={klass}
                  onChange={(e) => setKlass(e.target.value)}
                  aria-label="Filter by class"
                  className="h-8.5 rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-700 outline-none focus:border-teal-600 focus:ring-3 focus:ring-teal-600/12"
                >
                  <option value="all">All classes</option>
                  {classOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                  {unplaced ? <option value="none">No class</option> : null}
                </select>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                {FILTERS.map((f) => {
                  const count =
                    f.id === "flagged"
                      ? inScope.filter((s) => openFlags(s.id) > 0).length
                      : f.id === "in-progress"
                        ? inScope.filter((s) => s.status === "IN_PROGRESS").length
                        : f.id === "submitted"
                          ? inScope.filter((s) => s.status !== "IN_PROGRESS").length
                          : inScope.length;
                  const on = filter === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setFilter(f.id)}
                      className={`flex h-8.5 items-center gap-1.75 rounded-lg px-3.25 text-[13px] transition ${
                        on
                          ? "bg-teal-700 font-medium text-white"
                          : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      {f.label}
                      <span className={`tabular-nums ${on ? "opacity-75" : "opacity-60"}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
        {shown.length ? (
          <ul>
            {shown.map((s) => (
              <StudentRow
                key={s.id}
                examId={examId}
                session={s}
                name={studentNames[s.student_id] ?? s.student_id}
                classes={(studentClasses[s.student_id] ?? [])
                  .map((id) => classOptions.find((c) => c.id === id)?.label)
                  .filter((l): l is string => Boolean(l))}
                flags={flagsBySession.get(s.id) ?? []}
                questionLabels={questionLabels}
                answered={answeredBySession[s.id] ?? 0}
                asked={askedCount}
                recorded={recordsScreens || recordedSessions.includes(s.id)}
              />
            ))}
          </ul>
        ) : (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">
            {sessions.length
              ? "No sitting matches that. Clear the search or pick another filter."
              : "No one has started this exam yet."}
          </p>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "warn";
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-5 py-4.5">
      <p className="text-[12.5px] font-medium text-gray-500">
        {label}
      </p>
      <p
        className={`mt-2 text-3xl font-semibold tracking-tight tabular-nums ${
          tone === "warn" ? "text-amber-700" : "text-gray-900"
        }`}
      >
        {value}
      </p>
      {note ? <p className="mt-1 text-xs text-gray-500">{note}</p> : null}
    </div>
  );
}

function StudentRow({
  examId,
  session,
  name,
  classes,
  flags,
  questionLabels,
  answered,
  asked,
  recorded,
}: {
  examId: string;
  session: SessionRow;
  name: string;
  classes: string[];
  flags: FlagRow[];
  questionLabels: Record<string, string>;
  answered: number;
  asked: number;
  /** There is (or will be) a screen recording to watch for this sitting. */
  recorded: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState<MonitorState, FormData>(
    forceSubmit,
    {},
  );
  const [reopenState, reopen, reopening] = useActionState<MonitorState, FormData>(
    allowRetake,
    {},
  );
  const [extendState, extend, extending] = useActionState<MonitorState, FormData>(
    extendSitting,
    {},
  );
  const active = flags.filter((f) => f.resolution == null);
  const live = session.status === "IN_PROGRESS";
  const said =
    extendState.error || extendState.success
      ? extendState
      : reopenState.error || reopenState.success
        ? reopenState
        : state;

  // An allowance that has run out is not one. Compared against the render, so
  // it stops being offered as soon as the page next paints after it expires.
  const openUntil =
    session.reopened_until && new Date(session.reopened_until) > new Date()
      ? new Date(session.reopened_until)
      : null;

  // started_at is stamped by Postgres, submitted_at by the app server — two clocks,
  // so a fast submission can come back very slightly negative. Never show that.
  const elapsed = session.submitted_at
    ? Math.max(
        0,
        new Date(session.submitted_at).getTime() - new Date(session.started_at).getTime(),
      )
    : null;

  // A sitting still in progress has no submitted_at, so it had no elapsed time
  // and no progress — the rows a teacher is actually watching were the only
  // ones saying nothing. This ticks from the browser's clock, which is the
  // only one available while the paper is open.
  const [sinceStart, setSinceStart] = useState<number | null>(null);
  useEffect(() => {
    // No reset when it stops being live: `minutes` already picks the recorded
    // elapsed time in that case, so clearing this would be a write for nothing.
    if (!live) return;
    const started = new Date(session.started_at).getTime();
    const tick = () => setSinceStart(Math.max(0, Date.now() - started));
    // Scheduled rather than called straight away: reading the clock and
    // setting state inside the effect body is a render-phase write.
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [live, session.started_at]);

  const minutes = live ? sinceStart : elapsed;

  return (
    <li className="border-b border-gray-100 last:border-0 dark:border-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-5 px-6 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium tracking-[-0.005em] text-gray-900">{name}</p>
          {classes.length ? (
            <p className="mt-0.5 truncate text-xs text-accent">{classes.join(", ")}</p>
          ) : null}
          <p className="mt-[3px] text-[13px] tabular-nums text-gray-500">
            {live ? "in progress" : session.status.toLowerCase().replace("_", " ")}
            {session.score != null ? `, ${session.score}%` : ""}
            {minutes != null ? `, ${Math.round(minutes / 60000)} min` : ""}
            {live && asked ? `, ${answered} of ${asked} answered` : ""}
          </p>
        </div>

        <div className="flex items-center gap-4">
          {recorded ? (
            <Link
              href={`/exams/${examId}/monitor/${session.id}`}
              className="text-sm font-medium text-gray-900 underline decoration-gray-300 underline-offset-[3px] hover:decoration-gray-900"
            >
              Watch recording
            </Link>
          ) : null}
          {active.length ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-300"
            >
              {active.length} flag{active.length === 1 ? "" : "s"}
            </button>
          ) : (
            <span className="text-sm text-gray-400 dark:text-gray-600">clean</span>
          )}

          {live ? (
            // Only worth offering while they are still in the paper: an
            // allowance on a submitted sitting is an allowance to do nothing.
            <form action={extend} className="flex items-center gap-2">
              <input type="hidden" name="sessionId" value={session.id} />
              <input type="hidden" name="examId" value={examId} />
              {openUntil ? (
                <>
                  <span className="text-xs text-accent dark:text-[#5FBDB6]">
                    can answer until{" "}
                    {openUntil.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </span>
                  <button
                    type="submit"
                    name="end"
                    value="yes"
                    disabled={extending}
                    className="text-sm text-gray-600 underline decoration-gray-300 underline-offset-[3px] hover:decoration-gray-900 hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-100"
                  >
                    {extending ? "…" : "Take it back"}
                  </button>
                </>
              ) : (
                <button
                  type="submit"
                  disabled={extending}
                  title="Lets this student answer even after the exam closes"
                  className="text-sm text-gray-600 underline decoration-gray-300 underline-offset-[3px] hover:decoration-gray-900 hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-100"
                >
                  {extending ? "…" : "Give an hour"}
                </button>
              )}
            </form>
          ) : null}

          {live ? (
            <form action={submit}>
              <input type="hidden" name="sessionId" value={session.id} />
              <input type="hidden" name="examId" value={examId} />
              <button
                type="submit"
                disabled={pending}
                className="text-sm text-gray-600 underline decoration-gray-300 underline-offset-[3px] hover:decoration-gray-900 hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-100"
              >
                {pending ? "…" : "Force submit"}
              </button>
            </form>
          ) : (
            // A paper can end for reasons that are nobody's fault — a laptop that
            // died, a network that dropped. Without this the teacher had no remedy
            // at all: one sitting per student, and no way to undo it.
            <form action={reopen}>
              <input type="hidden" name="sessionId" value={session.id} />
              <input type="hidden" name="examId" value={examId} />
              <button
                type="submit"
                disabled={reopening}
                title="Reopens this sitting: answers kept, warnings cleared, clock restarted"
                className="text-sm text-gray-600 underline decoration-gray-300 underline-offset-[3px] hover:decoration-gray-900 hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-100"
              >
                {reopening ? "…" : "Let them back in"}
              </button>
            </form>
          )}
        </div>
      </div>

      {said.error ? (
        <p role="alert" className="px-6 pb-3 text-sm text-red-600 dark:text-red-400">
          {said.error}
        </p>
      ) : null}
      {said.success ? (
        <p role="status" className="px-6 pb-3 text-sm text-green-700 dark:text-green-400">
          {said.success}
        </p>
      ) : null}

      {open && flags.length ? (
        <ul className="border-t border-gray-100 bg-gray-50 px-6 py-3 dark:border-gray-800 dark:bg-gray-950">
          {flags.map((f) => (
            <FlagLine key={f.id} flag={f} examId={examId} questionLabels={questionLabels} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function FlagLine({
  flag,
  examId,
  questionLabels,
}: {
  flag: FlagRow;
  examId: string;
  questionLabels: Record<string, string>;
}) {
  const [state, submit, pending] = useActionState<MonitorState, FormData>(
    voidFlag,
    {},
  );
  const voided = flag.resolution === "VOIDED";

  return (
    <li className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className={voided ? "text-gray-400 line-through dark:text-gray-600" : "text-gray-700 dark:text-gray-300"}>
        {/* An extension finding is evidence, not a warning, so it has no number. */}
        {flag.type === "EXTENSION_DETECTED" ? "" : `#${flag.strike_number} `}
        {FLAG_LABELS[flag.type] ?? flag.type}
        <span className="ml-2 text-xs text-gray-400 dark:text-gray-600">
          {new Date(flag.occurred_at).toLocaleTimeString()}
        </span>
        {flag.question_id ? (
          <span className="ml-2 block text-xs text-gray-500 dark:text-gray-500">
            on {questionLabels[flag.question_id] ?? "a question"}
          </span>
        ) : null}
        {flag.detail ? (
          <span className="ml-2 block text-xs break-all text-gray-500">{flag.detail}</span>
        ) : null}
      </span>
      {voided ? (
        <span className="text-xs text-gray-400 dark:text-gray-600">voided</span>
      ) : (
        <form action={submit}>
          <input type="hidden" name="flagId" value={flag.id} />
          <input type="hidden" name="examId" value={examId} />
          <button
            type="submit"
            disabled={pending}
            className="text-xs text-gray-500 underline decoration-gray-300 underline-offset-[3px] hover:decoration-gray-900 hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-100"
          >
            {pending ? "…" : state.error ? "retry" : "void"}
          </button>
        </form>
      )}
    </li>
  );
}


/**
 * One button for the case where a whole class gets flagged at once — a
 * projector flicker, or everyone told to open a reference sheet. Clearing forty
 * of those one at a time is how a teacher learns to ignore flags entirely.
 */
function ClearAllFlags({ examId, open }: { examId: string; open: number }) {
  const [state, action, pending] = useActionState<MonitorState, FormData>(
    voidAllFlags,
    {},
  );
  if (!open) return null;

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="examId" value={examId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        {pending ? "Clearing…" : `Void all ${open} open flag${open === 1 ? "" : "s"}`}
      </button>
      {state.error ? (
        <span role="alert" className="text-sm text-red-600 dark:text-red-400">{state.error}</span>
      ) : null}
      {state.success ? (
        <span role="status" className="text-sm text-green-700 dark:text-green-400">{state.success}</span>
      ) : null}
    </form>
  );
}
