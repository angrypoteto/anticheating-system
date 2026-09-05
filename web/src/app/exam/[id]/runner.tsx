"use client";

import Link from "next/link";

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
  //
  // Built once by useState's lazy initialiser, and told where to report in an
  // effect: it outlives any one render, so it must not close over a callback
  // that would go stale.
  const [tracker] = useState(() => createDepartureTracker({}));

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

  useEffect(() => {
    tracker.setOnStrike(recordFlag);
  }, [tracker, recordFlag]);

  const noteDeparture = useCallback(
    (type: FlagType) => {
      if (endedRef.current || !started) return;
      tracker.leave(type);
    },
    [started, tracker],
  );

  /** Back on the paper: the next departure is a new one. */
  const noteReturn = useCallback(() => {
    if (document.visibilityState !== "visible" || !document.hasFocus()) return;
    tracker.back();
  }, [tracker]);

  // A departure still being collected when the page goes must not fire later.
  useEffect(() => () => tracker.dispose(), [tracker]);

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
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-50">
          Exam submitted
        </h2>
        {submitState.score != null ? (
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Score: {submitState.score}%
          </p>
        ) : null}
        <Link
          href="/"
          className="mt-6 inline-block text-sm text-gray-600 underline underline-offset-4 dark:text-gray-400"
        >
          Back to home
        </Link>
      </Shell>
    );
  }

  if (!started) {
    return (
      <Shell title={examTitle}>
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-50">
          Before you begin
        </h2>
        <ul className="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>· {questions.length} questions, answered one at a time.</li>
          <li>· You cannot return to a question once you move on.</li>
          {timer.totalMinutes > 0 ? (
            <li>· Time limit: {timer.totalMinutes} minutes.</li>
          ) : null}
          {timer.perQuestionSeconds ? (
            <li>
              · {timer.perQuestionSeconds} seconds per question — it moves on by
              itself when the time is up.
            </li>
          ) : null}
          {lockdown.fullscreenRequired ? <li>· Fullscreen is required.</li> : null}
          <li>
            · Leaving the exam window counts as one warning each time, however
            you leave it. {lockdown.maxStrikes} warnings end the attempt
            automatically.
          </li>
        </ul>
        {warning ? (
          <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
            {warning}
          </p>
        ) : null}
        <button
          type="button"
          onClick={startExam}
          className="mt-6 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
        >
          Start exam
        </button>
        <SubmitForm ref={formRef} sessionId={sessionId} action={submit} />
      </Shell>
    );
  }

  return (
    <Shell title={examTitle}>
      <div className="mb-4 flex items-center justify-between text-sm">
        <span className="text-gray-500 dark:text-gray-400">
          Question {index + 1} of {questions.length}
        </span>
        <span className="flex items-center gap-4">
          {saving ? (
            <span className="text-gray-400 dark:text-gray-500">saving…</span>
          ) : null}
          {strikes > 0 ? (
            <span className="text-amber-700 dark:text-amber-400">
              {strikes}/{lockdown.maxStrikes} warnings
            </span>
          ) : null}
          {questionRemaining != null ? (
            <span
              className={
                questionRemaining < 10000
                  ? "font-medium text-red-600 dark:text-red-400"
                  : "text-gray-600 dark:text-gray-400"
              }
              title="Time left on this question"
            >
              Q {Math.ceil(questionRemaining / 1000)}s
            </span>
          ) : null}
          {remaining != null ? (
            <span
              className={
                remaining < 60000
                  ? "font-medium text-red-600 dark:text-red-400"
                  : "text-gray-600 dark:text-gray-400"
              }
              title="Time left on the whole exam"
            >
              {formatTime(remaining)}
            </span>
          ) : null}
        </span>
      </div>

      {warning ? (
        <p
          role="alert"
          className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
        >
          {warning}
        </p>
      ) : null}

      {question ? (
        <div className="select-none">
          <p className="text-gray-900 dark:text-gray-100">{question.prompt}</p>

          {question.type === "MULTIPLE_CHOICE" ? (
            <div className="mt-4 space-y-2">
              {(question.choices ?? []).map((choice) => (
                <label
                  key={choice}
                  className="flex cursor-pointer items-center gap-3 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 hover:border-gray-400 dark:border-gray-700 dark:text-gray-200 dark:hover:border-gray-500"
                >
                  <input
                    type="radio"
                    name={`q-${question.id}`}
                    value={choice}
                    checked={answers[question.id] === choice}
                    onChange={() => onAnswer(question.id, choice)}
                  />
                  {choice}
                </label>
              ))}
            </div>
          ) : (
            <input
              type="text"
              value={answers[question.id] ?? ""}
              onChange={(e) => onAnswer(question.id, e.target.value)}
              autoComplete="off"
              className="mt-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
            />
          )}

          {lockdown.honeypot ? <Honeypot onTrip={() => recordFlag("HONEYPOT", question.id)} /> : null}

          <div className="mt-6 flex justify-end">
            {isLast ? (
              <button
                type="button"
                disabled={submitting}
                onClick={() => finish("manual")}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
              >
                {submitting ? "Submitting…" : "Submit exam"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void advance()}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900"
              >
                Next question
              </button>
            )}
          </div>
        </div>
      ) : null}

      {submitState.error ? (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
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
    <main className="min-h-screen bg-gray-50 p-8 dark:bg-gray-950">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 border-b border-gray-200 pb-4 text-xl font-semibold text-gray-900 dark:border-gray-800 dark:text-gray-50">
          {title}
        </h1>
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          {children}
        </div>
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
