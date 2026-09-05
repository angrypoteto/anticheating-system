"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createDepartureTracker, type FlagType } from "@/lib/departure";
import type { LockdownConfig, TimerConfig } from "@/lib/exam-config";
import { submitExam, type SubmitState } from "./actions";

export type RunnerQuestion = {
  id: string;
  type: string;
  prompt: string;
  choices: string[] | null;
};


const AUTOSAVE_MS = 700;

export function ExamRunner({
  sessionId,
  examTitle,
  questions,
  timer,
  lockdown,
  startedAt,
  savedAnswers,
}: {
  sessionId: string;
  examTitle: string;
  questions: RunnerQuestion[];
  timer: TimerConfig;
  lockdown: LockdownConfig;
  startedAt: string;
  savedAnswers: Record<string, string>;
}) {
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(() => {
    // Resume where they left off; questions are forward-only.
    const answered = questions.filter((q) => savedAnswers[q.id] != null).length;
    return Math.min(answered, Math.max(questions.length - 1, 0));
  });
  const [answers, setAnswers] = useState<Record<string, string>>(savedAnswers);
  const [strikes, setStrikes] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [questionRemaining, setQuestionRemaining] = useState<number | null>(null);

  const [submitState, submit, submitting] = useActionState<SubmitState, FormData>(
    submitExam,
    {},
  );

  const supabase = useRef(createClient());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const endedRef = useRef(false);
  const strikesRef = useRef(0);

  // One departure is one strike, however many events the browser fires for it.
  // The tracker holds that rule; see lib/departure.ts for why it has to.
  const trackerRef = useRef<ReturnType<typeof createDepartureTracker> | null>(null);
  const recordFlagRef = useRef<(type: FlagType) => void>(() => {});

  const done = submitState.submitted === true;

  const finish = useCallback(
    (reason: string) => {
      if (endedRef.current) return;
      endedRef.current = true;
      const form = formRef.current;
      if (!form) return;
      (form.elements.namedItem("reason") as HTMLInputElement).value = reason;
      form.requestSubmit();
    },
    [],
  );

  // Listeners and interval callbacks capture their first render's values, so the
  // live index, answers and current question are mirrored into refs they can read.
  const currentQuestionRef = useRef<string | null>(null);
  const indexRef = useRef(0);
  const answersRef = useRef<Record<string, string>>({});

  useEffect(() => {
    indexRef.current = index;
    currentQuestionRef.current = questions[index]?.id ?? null;
  }, [index, questions]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const recordFlag = useCallback(
    async (type: FlagType, questionId?: string) => {
      if (endedRef.current || !started) return;
      const next = strikesRef.current + 1;
      strikesRef.current = next;
      setStrikes(next);

      // Written client-direct to Supabase: a flag that waits on a serverless
      // cold start is a flag the dashboard sees late.
      await supabase.current.from("flags").insert({
        session_id: sessionId,
        type,
        strike_number: next,
        question_id: questionId ?? currentQuestionRef.current,
      });

      if (next >= lockdown.maxStrikes) {
        setWarning("Strike limit reached — submitting your exam.");
        finish("strikes");
      } else if (next === lockdown.maxStrikes - 1) {
        // The last warning has to say what happens next, not just count.
        setWarning(
          `Warning ${next} of ${lockdown.maxStrikes}. One more and your exam is submitted automatically.`,
        );
      } else {
        setWarning(
          `Warning ${next} of ${lockdown.maxStrikes}: leaving the exam window is recorded.`,
        );
      }
    },
    [sessionId, lockdown.maxStrikes, started, finish],
  );

  // The tracker is built once and reads the latest recordFlag through a ref, so
  // rebuilding it cannot lose a departure that is mid-collection.
  useEffect(() => {
    recordFlagRef.current = recordFlag;
  }, [recordFlag]);

  if (!trackerRef.current) {
    trackerRef.current = createDepartureTracker({
      onStrike: (type) => recordFlagRef.current(type),
    });
  }

  const noteDeparture = useCallback(
    (type: FlagType) => {
      if (endedRef.current || !started) return;
      trackerRef.current?.leave(type);
    },
    [started],
  );

  /** Back on the paper: the next departure is a new one. */
  const noteReturn = useCallback(() => {
    if (document.visibilityState !== "visible" || !document.hasFocus()) return;
    trackerRef.current?.back();
  }, []);

  // --- lockdown listeners ---
  useEffect(() => {
    if (!started || done) return;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") noteDeparture("TAB_SWITCH");
      else noteReturn();
    };
    const onBlur = () => noteDeparture("WINDOW_BLUR");
    const onFocus = () => noteReturn();
    const onFullscreenChange = () => {
      if (!lockdown.fullscreenRequired) return;
      if (!document.fullscreenElement) noteDeparture("FULLSCREEN_EXIT");
      else noteReturn();
    };
    const block = (e: Event) => e.preventDefault();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("fullscreenchange", onFullscreenChange);

    if (lockdown.blockCopyPaste) {
      document.addEventListener("copy", block);
      document.addEventListener("paste", block);
      document.addEventListener("cut", block);
      document.addEventListener("contextmenu", block);
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("copy", block);
      document.removeEventListener("paste", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("contextmenu", block);
    };
  }, [
    started,
    done,
    lockdown.fullscreenRequired,
    lockdown.blockCopyPaste,
    noteDeparture,
    noteReturn,
  ]);

  // --- countdown ---
  useEffect(() => {
    if (!started || done || timer.totalMinutes <= 0) return;
    const endsAt = new Date(startedAt).getTime() + timer.totalMinutes * 60000;

    const tick = () => {
      const left = Math.max(0, endsAt - Date.now());
      setRemaining(left);
      if (left <= 0) finish("timeout");
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [started, done, timer.totalMinutes, startedAt, finish]);

  const persist = useCallback(
    async (questionId: string, value: string) => {
      setSaving(true);
      await supabase.current.from("answers").upsert(
        { session_id: sessionId, question_id: questionId, response: value },
        { onConflict: "session_id,question_id" },
      );
      setSaving(false);
    },
    [sessionId],
  );

  const onAnswer = (questionId: string, value: string) => {
    setAnswers((a) => ({ ...a, [questionId]: value }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(questionId, value), AUTOSAVE_MS);
  };

  // Shared by the Next button and the per-question timer, so a question that runs
  // out of time is saved and left behind exactly as if the student had moved on.
  const advance = useCallback(async () => {
    const q = questions[indexRef.current];
    if (!q) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const pending = answersRef.current[q.id];
    if (pending != null) await persist(q.id, pending);

    if (indexRef.current >= questions.length - 1) {
      finish("manual");
    } else {
      setIndex((i) => i + 1);
    }
  }, [questions, persist, finish]);

  // --- per-question countdown ---
  useEffect(() => {
    if (!started || done || !timer.perQuestionSeconds) return;
    const limit = timer.perQuestionSeconds * 1000;
    const startedThisQuestion = Date.now();

    const tick = () => {
      const left = Math.max(0, limit - (Date.now() - startedThisQuestion));
      setQuestionRemaining(left);
      if (left <= 0) void advance();
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [started, done, index, timer.perQuestionSeconds, advance]);

  const startExam = async () => {
    if (lockdown.fullscreenRequired) {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        setWarning("Fullscreen was blocked — allow it to begin.");
        return;
      }
    }
    setStarted(true);
  };

  const question = questions[index];
  const isLast = index === questions.length - 1;

  if (done) {
    return (
      <Shell title={examTitle}>
        <div className="py-2 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
            <svg viewBox="0 0 20 20" fill="none" className="h-6 w-6" aria-hidden>
              <path d="M4 10.5 8.5 15 16 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h2 className="mt-4 text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
            Exam submitted
          </h2>
          {submitState.score != null ? (
            <p className="mt-2 inline-block rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold tabular-nums text-slate-900 dark:bg-slate-800 dark:text-white">
              Score: {submitState.score}%
            </p>
          ) : null}
          <div>
            <a
              href="/"
              className="mt-6 inline-flex rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              Back to home
            </a>
          </div>
        </div>
      </Shell>
    );
  }

  if (!started) {
    return (
      <Shell title={examTitle}>
        <p className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-700 ring-1 ring-inset ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-300">
          Before you begin
        </p>
        <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Read this — it counts.
        </h2>
        <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          <li className="flex gap-2.5 rounded-xl bg-slate-50 px-3.5 py-2.5 ring-1 ring-inset ring-slate-200/60 dark:bg-slate-800/50 dark:ring-slate-700/50"><span className="font-semibold text-slate-900 dark:text-white">{questions.length}</span> questions, answered one at a time.</li>
          <li className="flex gap-2.5 rounded-xl bg-slate-50 px-3.5 py-2.5 ring-1 ring-inset ring-slate-200/60 dark:bg-slate-800/50 dark:ring-slate-700/50">You cannot return to a question once you move on.</li>
          {timer.totalMinutes > 0 ? (
            <li className="flex gap-2.5 rounded-xl bg-slate-50 px-3.5 py-2.5 ring-1 ring-inset ring-slate-200/60 dark:bg-slate-800/50 dark:ring-slate-700/50">Time limit: <span className="font-semibold text-slate-900 dark:text-white">{timer.totalMinutes} minutes</span>.</li>
          ) : null}
          {timer.perQuestionSeconds ? (
            <li className="flex gap-2.5 rounded-xl bg-slate-50 px-3.5 py-2.5 ring-1 ring-inset ring-slate-200/60 dark:bg-slate-800/50 dark:ring-slate-700/50">
              {timer.perQuestionSeconds} seconds per question — it moves on by
              itself when the time is up.
            </li>
          ) : null}
          {lockdown.fullscreenRequired ? <li className="flex gap-2.5 rounded-xl bg-slate-50 px-3.5 py-2.5 ring-1 ring-inset ring-slate-200/60 dark:bg-slate-800/50 dark:ring-slate-700/50">Fullscreen is required.</li> : null}
          <li className="flex gap-2.5 rounded-xl bg-amber-50 px-3.5 py-2.5 text-amber-900 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-200">
            Leaving the exam window counts as one warning each time, however
            you leave it. {lockdown.maxStrikes} warnings end the attempt
            automatically.
          </li>
        </ul>
        {warning ? (
          <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300">
            {warning}
          </p>
        ) : null}
        <button
          type="button"
          onClick={startExam}
          className="mt-6 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgb(79_70_229/0.7)] transition hover:bg-indigo-700"
        >
          Start exam →
        </button>
        <SubmitForm ref={formRef} sessionId={sessionId} action={submit} />
      </Shell>
    );
  }

  return (
    <Shell title={examTitle}>
      {/* Progress */}
      <div className="mb-1 flex items-center justify-between text-[13px]">
        <span className="font-semibold text-slate-900 dark:text-white">
          Question {index + 1} <span className="font-normal text-slate-400">of {questions.length}</span>
        </span>
        <span className="flex items-center gap-2">
          {saving ? (
            <span className="text-slate-400 dark:text-slate-500">saving…</span>
          ) : null}
          {strikes > 0 ? (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/25 dark:bg-amber-500/10 dark:text-amber-300">
              {strikes}/{lockdown.maxStrikes} warnings
            </span>
          ) : (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300">
              Clean run
            </span>
          )}
          {questionRemaining != null ? (
            <span
              className={`rounded-lg px-2 py-1 font-mono text-xs font-semibold tabular-nums ${
                questionRemaining < 10000
                  ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              }`}
              title="Time left on this question"
            >
              Q {Math.ceil(questionRemaining / 1000)}s
            </span>
          ) : null}
          {remaining != null ? (
            <span
              className={`rounded-lg px-2 py-1 font-mono text-xs font-semibold tabular-nums ${
                remaining < 60000
                  ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300"
                  : "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
              }`}
              title="Time left on the whole exam"
            >
              {formatTime(remaining)}
            </span>
          ) : null}
        </span>
      </div>
      <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-violet-500 transition-all"
          style={{ width: `${((index + 1) / Math.max(1, questions.length)) * 100}%` }}
        />
      </div>

      {warning ? (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-amber-200/70 bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200"
        >
          {warning}
        </p>
      ) : null}

      {question ? (
        <div className="select-none">
          <p className="text-[16px] font-medium leading-relaxed tracking-tight text-slate-900 dark:text-white">{question.prompt}</p>

          {question.type === "MULTIPLE_CHOICE" ? (
            <div className="mt-4 space-y-2.5">
              {(question.choices ?? []).map((choice, ci) => {
                const selected = answers[question.id] === choice;
                return (
                  <label
                    key={choice}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition ${
                      selected
                        ? "border-indigo-500 bg-indigo-50/70 ring-4 ring-indigo-500/10 dark:border-indigo-400 dark:bg-indigo-500/10"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                        selected
                          ? "border-indigo-600 bg-indigo-600 text-white"
                          : "border-slate-300 text-slate-400 dark:border-slate-600"
                      }`}
                    >
                      {selected ? "✓" : String.fromCharCode(65 + ci)}
                    </span>
                    <input
                      type="radio"
                      name={`q-${question.id}`}
                      value={choice}
                      checked={selected}
                      onChange={() => onAnswer(question.id, choice)}
                      className="sr-only"
                    />
                    <span className="font-medium text-slate-800 dark:text-slate-100">{choice}</span>
                  </label>
                );
              })}
            </div>
          ) : (
            <input
              type="text"
              value={answers[question.id] ?? ""}
              onChange={(e) => onAnswer(question.id, e.target.value)}
              autoComplete="off"
              placeholder="Type your answer…"
              className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-3 text-sm text-slate-900 shadow-[inset_0_1px_2px_rgb(15_23_42/0.04)] outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          )}

          {lockdown.honeypot ? <Honeypot onTrip={() => recordFlag("HONEYPOT", question.id)} /> : null}

          <div className="mt-6 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {Object.keys(answers).length}/{questions.length} answered
            </span>
            {isLast ? (
              <button
                type="button"
                disabled={submitting}
                onClick={() => finish("manual")}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgb(5_150_105/0.6)] transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit exam ✓"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void advance()}
                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgb(79_70_229/0.6)] transition hover:bg-indigo-700"
              >
                Next question →
              </button>
            )}
          </div>
        </div>
      ) : null}

      {submitState.error ? (
        <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300">
          {submitState.error}
        </p>
      ) : null}

      <SubmitForm ref={formRef} sessionId={sessionId} action={submit} />
    </Shell>
  );
}

function SubmitForm({
  ref,
  sessionId,
  action,
}: {
  ref: React.Ref<HTMLFormElement>;
  sessionId: string;
  action: (formData: FormData) => void;
}) {
  return (
    <form ref={ref} action={action} className="hidden">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="reason" defaultValue="manual" />
    </form>
  );
}

/**
 * Invisible to a person reading the page, but present in the DOM and reachable by
 * autofill or anything scripting the form. Only a non-human interaction fills it.
 */
function Honeypot({ onTrip }: { onTrip: () => void }) {
  return (
    <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
      <label htmlFor="answer_assist">Answer assist</label>
      <input
        id="answer_assist"
        name="answer_assist"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        onChange={onTrip}
      />
    </div>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="border-b border-slate-200/70 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
        <div className="mx-auto flex max-w-2xl items-center gap-2.5 px-5 py-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
              <path d="M8 1.5 13.5 4v4c0 3.2-2.3 5.6-5.5 6.5C4.8 13.6 2.5 11.2 2.5 8V4z" fill="currentColor" fillOpacity="0.95" />
              <path d="M5.8 8.1 7.4 9.7 10.2 6.9" stroke="#4f46e5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h1 className="truncate text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
            {title}
          </h1>
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Monitored
          </span>
        </div>
      </div>
      <div className="mx-auto max-w-2xl px-5 py-8">
        <div className="card-elev rounded-2xl border border-slate-200/80 bg-white p-6 sm:p-7 dark:border-slate-800 dark:bg-slate-900">
          {children}
        </div>
        <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
          Leaving this window is recorded · Copy &amp; paste may be disabled
        </p>
      </div>
    </main>
  );
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
