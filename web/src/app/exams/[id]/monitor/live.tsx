"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { allowRetake, forceSubmit, voidAllFlags, voidFlag, type MonitorState } from "./actions";

export type SessionRow = {
  id: string;
  student_id: string;
  status: string;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
};

export type FlagRow = {
  id: string;
  session_id: string;
  type: string;
  strike_number: number;
  occurred_at: string;
  resolution: string | null;
  question_id: string | null;
};

const FLAG_LABELS: Record<string, string> = {
  TAB_SWITCH: "switched tab",
  FULLSCREEN_EXIT: "left fullscreen",
  WINDOW_BLUR: "window lost focus",
  HONEYPOT: "honeypot triggered",
};

export function LiveMonitor({
  examId,
  initialSessions,
  initialFlags,
  studentNames,
  questionLabels,
}: {
  examId: string;
  initialSessions: SessionRow[];
  initialFlags: FlagRow[];
  studentNames: Record<string, string>;
  questionLabels: Record<string, string>;
}) {
  const [sessions, setSessions] = useState(initialSessions);
  const [flags, setFlags] = useState(initialFlags);
  const [toast, setToast] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
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
            setToast(`${who ?? "A student"} — ${FLAG_LABELS[row.type] ?? row.type}`);
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
        .select("id, student_id, status, started_at, submitted_at, score")
        .eq("exam_id", examId)
        .order("started_at");
      if (!freshSessions) return;

      for (const s of freshSessions) known.add(s.id);
      setSessions(freshSessions as SessionRow[]);

      const ids = freshSessions.map((s) => s.id);
      if (!ids.length) return;

      const { data: freshFlags } = await client
        .from("flags")
        .select("id, session_id, type, strike_number, occurred_at, resolution, question_id")
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

  const inProgress = sessions.filter((s) => s.status === "IN_PROGRESS");
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
          className="fixed right-6 top-6 z-50 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        >
          {toast}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="In progress" value={String(inProgress.length)} />
        <Stat label="Submitted" value={String(submitted.length)} />
        <Stat
          label="Flags"
          value={String(flags.filter((f) => f.resolution == null).length)}
        />
        <Stat label="Average" value={average != null ? `${average}%` : "—"} />
      </div>

      <ClearAllFlags examId={examId} open={flags.filter((f) => f.resolution == null).length} />

      <p className="text-xs text-gray-500 dark:text-gray-400">
        {connected ? "● Live — updates stream in as they happen" : "○ Connecting…"}
      </p>

      <section className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 p-6 dark:border-gray-800">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-50">
            Students
          </h2>
        </div>
        {sessions.length ? (
          <ul>
            {sessions.map((s) => (
              <StudentRow
                key={s.id}
                examId={examId}
                session={s}
                name={studentNames[s.student_id] ?? s.student_id}
                flags={flagsBySession.get(s.id) ?? []}
                questionLabels={questionLabels}
              />
            ))}
          </ul>
        ) : (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">
            No one has started this exam yet.
          </p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-50">
        {value}
      </p>
    </div>
  );
}

function StudentRow({
  examId,
  session,
  name,
  flags,
  questionLabels,
}: {
  examId: string;
  session: SessionRow;
  name: string;
  flags: FlagRow[];
  questionLabels: Record<string, string>;
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
  const active = flags.filter((f) => f.resolution == null);
  const live = session.status === "IN_PROGRESS";
  const said = reopenState.error || reopenState.success ? reopenState : state;

  // started_at is stamped by Postgres, submitted_at by the app server — two clocks,
  // so a fast submission can come back very slightly negative. Never show that.
  const elapsed = session.submitted_at
    ? Math.max(
        0,
        new Date(session.submitted_at).getTime() - new Date(session.started_at).getTime(),
      )
    : null;

  return (
    <li className="border-b border-gray-100 last:border-0 dark:border-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 dark:text-gray-100">{name}</p>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {live ? "in progress" : session.status.toLowerCase().replace("_", " ")}
            {session.score != null ? ` · ${session.score}%` : ""}
            {elapsed != null ? ` · ${Math.round(elapsed / 60000)} min` : ""}
          </p>
        </div>

        <div className="flex items-center gap-4">
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
            <form action={submit}>
              <input type="hidden" name="sessionId" value={session.id} />
              <input type="hidden" name="examId" value={examId} />
              <button
                type="submit"
                disabled={pending}
                className="text-sm text-gray-600 underline underline-offset-4 hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-100"
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
                className="text-sm text-gray-600 underline underline-offset-4 hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-100"
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
        #{flag.strike_number} {FLAG_LABELS[flag.type] ?? flag.type}
        <span className="ml-2 text-xs text-gray-400 dark:text-gray-600">
          {new Date(flag.occurred_at).toLocaleTimeString()}
        </span>
        {flag.question_id ? (
          <span className="ml-2 block text-xs text-gray-500 dark:text-gray-500">
            on {questionLabels[flag.question_id] ?? "a question"}
          </span>
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
            className="text-xs text-gray-500 underline underline-offset-4 hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-100"
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
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
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
