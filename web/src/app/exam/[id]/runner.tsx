"use client";

import Link from "next/link";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createDepartureTracker, type FlagType } from "@/lib/departure";
import { ShieldMark } from "@/components/auth-shell";
import type { LockdownConfig, TimerConfig } from "@/lib/exam-config";
import { explainSubmission } from "@/lib/submission";
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
  initialStrikes,
}: {
  sessionId: string;
  examTitle: string;
  questions: RunnerQuestion[];
  timer: TimerConfig;
  lockdown: LockdownConfig;
  startedAt: string;
  savedAnswers: Record<string, string>;
  /** Warnings already standing against this sitting, counted by the database. */
  initialStrikes: number;
}) {
  const [started, setStarted] = useState(false);
  /**
   * The review pass, shown once every question has been seen.
   *
   * Tesler's law: complexity is conserved, and "you cannot return to a
   * question once you move on" put all of it on the student — one mis-click
   * was a mark gone for good, with no way to find out which one. The rule that
   * earns its keep is not being able to read ahead, since that is what stops
   * somebody scanning all 25 and going looking. Having already reached the end,
   * a pass back over the blanks costs the exam nothing.
   *
   * Everything else still applies while this is on screen: the clock runs, the
   * window is watched, and a departure is still recorded.
   */
  const [reviewing, setReviewing] = useState(false);
  /** True once the last question has been reached at least once. */
  const [reachedEnd, setReachedEnd] = useState(false);

  const [index, setIndex] = useState(() => {
    // Resume where they left off; questions are forward-only.
    const answered = questions.filter((q) => savedAnswers[q.id] != null).length;
    return Math.min(answered, Math.max(questions.length - 1, 0));
  });
  const [answers, setAnswers] = useState<Record<string, string>>(savedAnswers);
  const [strikes, setStrikes] = useState(initialStrikes);
  const [warning, setWarning] = useState<string | null>(null);
  // Another tab of the same sitting has taken over; this one stops proctoring.
  const [superseded, setSuperseded] = useState(false);
  // Alt-tabbing out of a fullscreen window ends fullscreen, and nothing put it
  // back: the warning was recorded and the paper then simply carried on in a
  // window, with "fullscreen required" quietly unenforced for the rest of it.
  const [fullscreen, setFullscreen] = useState(false);
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

  // One departure is one strike, however many events the browser fires for it.
  // The tracker holds that rule; see lib/departure.ts for why it has to.
  //
  // Built once by useState's lazy initialiser, and told where to report in an
  // effect: it outlives any one render, so it must not close over a callback
  // that would go stale.
  const [tracker] = useState(() => createDepartureTracker({}));

  const done = submitState.submitted === true;

  // Out of fullscreen where fullscreen is required: the paper is hidden until
  // they are back. Leaving used to cost one warning and then buy an unwatched
  // window over the questions for the rest of the exam — worth a great deal
  // more than the warning cost.
  const paused =
    started && !done && !superseded && lockdown.fullscreenRequired && !fullscreen;
  const pausedRef = useRef(false);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Whatever is typed into the question on screen but not yet saved. The save is
  // debounced, so clicking Submit within that debounce — or being auto-submitted
  // — used to throw the answer away.
  const flushRef = useRef<() => Promise<void>>(async () => {});

  const finish = useCallback((reason: string) => {
    if (endedRef.current) return;
    endedRef.current = true;

    const send = () => {
      const form = formRef.current;
      if (!form) return;
      (form.elements.namedItem("reason") as HTMLInputElement).value = reason;
      form.requestSubmit();
    };

    // Saving the last answer must not be able to hold the submission hostage.
    void Promise.race([
      flushRef.current(),
      new Promise((r) => setTimeout(r, 2000)),
    ]).then(send, send);
  }, []);

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
      if (endedRef.current || !started || superseded) return;

      // Written client-direct to Supabase: a flag that waits on a serverless
      // cold start is a flag the dashboard sees late.
      //
      // The count comes back from the database rather than from a counter in
      // this tab. A tab's counter starts at zero on every mount, so a reload or
      // a second tab used to run a tally of its own — and the limit was checked
      // against whichever tally happened to be counting. record_flag() also
      // decides whether this signal is a new departure or more evidence of the
      // one already counted, which is a judgement only the whole record can make.
      const { data, error } = await supabase.current.rpc("record_flag", {
        p_session_id: sessionId,
        p_type: type,
        p_question_id: questionId ?? currentQuestionRef.current,
      });

      if (error || typeof data !== "number") {
        // Nothing was written down, so nothing has been earned. Ending a paper on
        // a strike the record does not contain is the failure this exists to stop.
        setWarning("Leaving the exam window is recorded — check your connection.");
        return;
      }

      const next = data;
      setStrikes(next);

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
    [sessionId, lockdown.maxStrikes, started, superseded, finish],
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

  // One sitting, one proctored tab.
  //
  // Two tabs on the same paper each ran their own listeners, so moving between
  // them was recorded as leaving the exam — twice, once by each. The newest tab
  // keeps the paper and the older ones stand down. Nothing is lost by yielding:
  // the sitting is server-side and the new tab resumes the same saved answers.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(`exam-${sessionId}`);
    const me = Math.random().toString(36).slice(2);
    channel.onmessage = (e: MessageEvent<{ claim?: string }>) => {
      if (e.data?.claim && e.data.claim !== me) setSuperseded(true);
    };
    channel.postMessage({ claim: me });
    return () => channel.close();
  }, [sessionId]);

  // --- lockdown listeners ---
  useEffect(() => {
    if (!started || done || superseded) return;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") noteDeparture("TAB_SWITCH");
      else noteReturn();
    };
    const onBlur = () => noteDeparture("WINDOW_BLUR");
    const onFocus = () => noteReturn();
    const onFullscreenChange = () => {
      const inside = Boolean(document.fullscreenElement);
      setFullscreen(inside);
      if (!lockdown.fullscreenRequired) return;
      if (!inside) noteDeparture("FULLSCREEN_EXIT");
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
    superseded,
    lockdown.fullscreenRequired,
    lockdown.blockCopyPaste,
    noteDeparture,
    noteReturn,
  ]);

  // --- countdown ---
  useEffect(() => {
    if (!started || done || superseded || timer.totalMinutes <= 0) return;
    const endsAt = new Date(startedAt).getTime() + timer.totalMinutes * 60000;

    const tick = () => {
      const left = Math.max(0, endsAt - Date.now());
      setRemaining(left);
      if (left <= 0) finish("timeout");
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [started, done, superseded, timer.totalMinutes, startedAt, finish]);

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

  // Save whatever is on screen now, cancelling the debounce that was going to.
  // Held in a ref because `finish` is called from event listeners that must not
  // close over a stale copy.
  useEffect(() => {
    flushRef.current = async () => {
      const q = questions[indexRef.current];
      if (!q) return;
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      const pending = answersRef.current[q.id];
      if (pending != null) await persist(q.id, pending);
    };
  }, [questions, persist]);

  // Shared by the Next button and the per-question timer, so a question that runs
  // out of time is saved and left behind exactly as if the student had moved on.
  const advance = useCallback(async () => {
    if (!questions[indexRef.current]) return;
    await flushRef.current();

    if (indexRef.current >= questions.length - 1) {
      setReachedEnd(true);
      setReviewing(true);
    } else {
      setIndex((i) => i + 1);
    }
  }, [questions]);

  // --- per-question countdown ---
  //
  // This advances whether or not the question was answered, and deliberately
  // so: the Next button requires an answer, but a per-question limit must not
  // be. Otherwise refusing to answer would stop the clock indefinitely, which
  // is a way to sit one question for the whole hour. It is also why the review
  // at the end still has a blank path — a timed-out question is a real blank.
  useEffect(() => {
    if (!started || done || superseded || !timer.perQuestionSeconds) return;
    const limit = timer.perQuestionSeconds * 1000;
    const startedThisQuestion = Date.now();

    const tick = () => {
      const left = Math.max(0, limit - (Date.now() - startedThisQuestion));
      setQuestionRemaining(left);
      if (left <= 0 && !pausedRef.current) void advance();
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [started, done, superseded, index, timer.perQuestionSeconds, advance]);

  /**
   * Ask for fullscreen. Only ever from a click.
   *
   * A browser will not grant fullscreen without a gesture behind it, so the
   * paper cannot put itself back on its own however much it would like to —
   * which is why leaving is met with a button rather than a silent recovery.
   */
  const enterFullscreen = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
      setFullscreen(true);
      return true;
    } catch {
      setWarning(
        "Your browser would not go fullscreen. Allow it, or press F11, to carry on.",
      );
      return false;
    }
  }, []);

  const startExam = async () => {
    if (lockdown.fullscreenRequired && !(await enterFullscreen())) return;
    setStarted(true);
  };

  const question = questions[index];
  const isLast = index === questions.length - 1;

  if (done) {
    // The same words the exam page will give if they come back to it later.
    const said = explainSubmission(submitState.reason ?? null, {
      strikes,
      maxStrikes: lockdown.maxStrikes,
    });
    return (
      <Shell title={examTitle}>
        <h2
          className={`text-lg font-medium ${
            said.blamed
              ? "text-amber-800 dark:text-amber-300"
              : "text-gray-900 dark:text-gray-50"
          }`}
        >
          {said.headline}
        </h2>
        {said.detail ? (
          <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            {said.detail}
          </p>
        ) : null}
        {submitState.score != null ? (
          <p className="mt-4 border-t border-gray-200 pt-4 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-400">
            Score:{" "}
            <span className="text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">
              {submitState.score}%
            </span>
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

  if (superseded) {
    return (
      <Shell title={examTitle}>
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-50">
          Opened in another tab
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          This exam is now open in a newer tab or window, and is being taken
          there. Your answers are saved — carry on in that one. Nothing you do
          here is recorded.
        </p>
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

  // The paper a student actually sits, and the only screen in the product
  // with no product on it: no sidebar, no breadcrumb, no navigation. One
  // dominant element, and the chrome cut back to the two facts that change
  // what they do next — how long is left, and how many warnings they carry.
  const answered = questions.filter(
    (q) => answers[q.id] != null && answers[q.id] !== "",
  ).length;

  // Which questions are still blank, in the order they were asked. Once the
  // end has been reached, every forward button returns to the review instead
  // of walking through the rest again.
  const blanks = questions
    .map((q, i) => (answers[q.id] != null && answers[q.id] !== "" ? -1 : i))
    .filter((i) => i >= 0);
  const seen = reachedEnd;

  // Moving on requires an answer.
  //
  // Forward-only and skippable together meant a question could be passed by
  // accident — a mis-click on Next, and the mark was gone with nothing said.
  // Requiring one before the button works costs a student who does not know
  // the answer a guess, which is the trade the school is making deliberately.
  // Typed answers must contain something: a space is not an answer.
  const current = question ? answers[question.id] : undefined;
  const hasAnswer = typeof current === "string" && current.trim() !== "";
  const through = Math.round(((index + 1) / Math.max(questions.length, 1)) * 100);

  return (
    <main className="flex min-h-screen flex-col bg-gray-950">
      <header className="flex flex-wrap items-center justify-between gap-6 bg-gray-900 px-8 py-3.5 text-white">
        <div className="flex min-w-0 items-center gap-3 text-sm">
          <ShieldMark className="h-5 w-5 shrink-0" />
          <span className="truncate font-medium">{examTitle}</span>
        </div>
        <div className="flex items-center gap-5">
          {saving ? <span className="text-xs text-teal-300">saving…</span> : null}
          {strikes > 0 ? (
            <span className="flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/15 px-2.5 py-1 text-[13px] font-medium text-amber-200">
              <WarnMark className="h-3.5 w-3.5" />
              Warning {strikes} of {lockdown.maxStrikes}
            </span>
          ) : null}
          {questionRemaining != null ? (
            <span
              title="Time left on this question"
              className={`font-mono text-sm tabular-nums ${
                questionRemaining < 10000 ? "text-red-300" : "text-teal-200"
              }`}
            >
              Q {Math.ceil(questionRemaining / 1000)}s
            </span>
          ) : null}
          {remaining != null ? (
            <span
              title="Time left on the whole exam"
              className="flex items-baseline gap-2 font-mono text-xl font-medium tabular-nums"
            >
              <span className="font-sans text-[11px] font-medium tracking-[0.07em] text-teal-300 uppercase">
                Time left
              </span>
              <span className={remaining < 60000 ? "text-red-300" : "text-white"}>
                {formatTime(remaining)}
              </span>
            </span>
          ) : null}
        </div>
      </header>

      {/* Where they are, without a number to read. */}
      <div className="h-[3px] bg-white/12">
        <div
          className="h-full bg-teal-400 transition-[width] duration-500"
          style={{ width: `${Math.max(2, through)}%` }}
        />
      </div>

      <div className="flex flex-1 justify-center bg-gray-50 px-8 py-10 dark:bg-gray-950">
        <div className="w-full max-w-3xl">
          {warning ? (
            <div
              role="alert"
              className="mb-7 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3.5 dark:border-amber-800 dark:bg-amber-950"
            >
              <WarnMark className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
              <p className="text-sm leading-relaxed text-amber-900 dark:text-amber-200">
                {warning}
              </p>
            </div>
          ) : null}

          {paused ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-8 text-center dark:border-amber-800 dark:bg-amber-950">
              <h2 className="font-serif text-2xl font-semibold text-amber-900 dark:text-amber-200">
                Fullscreen ended — your exam is paused
              </h2>
              <p className="mx-auto mt-2.5 max-w-md text-sm leading-relaxed text-amber-800 dark:text-amber-300">
                The questions are hidden until you are back in fullscreen. This has
                already been recorded as one warning; going back now does not cost
                another. The clock keeps running.
              </p>
              <button
                type="button"
                onClick={() => void enterFullscreen()}
                className="mt-6 h-12 rounded-xl bg-teal-700 px-7 text-[15px] font-medium text-white transition hover:bg-teal-600"
              >
                Return to fullscreen
              </button>
            </div>
          ) : question ? (
            reviewing ? (
            <div className="select-none">
              <span className="mb-2.5 block text-xs font-medium tracking-[0.08em] text-gray-500 uppercase">
                All {questions.length} questions seen
              </span>
              <h2 className="font-serif text-[31px] leading-[1.25] font-semibold tracking-tight text-gray-900">
                {blanks.length === 0
                  ? "Everything is answered."
                  : blanks.length === 1
                    ? "One question is still blank."
                    : `${blanks.length} questions are still blank.`}
              </h2>
              <p className="mt-2.5 max-w-[62ch] text-[15px] leading-relaxed text-gray-700">
                {blanks.length
                  ? "You have reached the end of the paper. Blanks score nothing, so while the clock is still running you may go back and answer them. Answers you have already given stay as they are."
                  : "You have reached the end of the paper. Check anything you want to look at again, or submit it now."}
              </p>

              <div className="mt-6.5 rounded-xl border border-gray-200 bg-white px-6 py-5.5">
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-4">
                  <h3 className="text-[13px] font-medium tracking-[0.08em] text-gray-500 uppercase">
                    Your paper
                  </h3>
                  <div className="flex items-center gap-4 text-[12.5px] text-gray-500">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.75 w-2.75 rounded-[3px] border-[1.5px] border-teal-100 bg-teal-50" />
                      Answered
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.75 w-2.75 rounded-[3px] border-[1.5px] border-amber-200 bg-amber-50" />
                      Blank
                    </span>
                  </div>
                </div>

                {/* Twenty-five is past the point of counting, so they arrive in
                    rows of ten and only the blanks carry a colour. */}
                <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
                  {questions.map((q, i) => {
                    const blank = !answers[q.id];
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => {
                          setReviewing(false);
                          setIndex(i);
                        }}
                        aria-label={`Question ${i + 1}${blank ? ", blank" : ", answered"}`}
                        className={`flex h-11 items-center justify-center rounded-lg border-[1.5px] text-[13.5px] font-medium tabular-nums transition ${
                          blank
                            ? "border-amber-200 bg-amber-50 text-amber-900 hover:border-amber-300"
                            : "border-teal-100 bg-teal-50 text-teal-800 hover:border-teal-300"
                        }`}
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-7 flex flex-wrap items-center justify-between gap-5">
                <span className="text-sm text-gray-700 tabular-nums">
                  <b className="font-medium text-gray-900">
                    {answered} of {questions.length}
                  </b>{" "}
                  answered{blanks.length ? ` · ${blanks.length} blank` : ""}
                </span>
                <div className="flex flex-wrap items-center gap-4">
                  {blanks.length ? (
                    <button
                      type="button"
                      onClick={() => {
                        setReviewing(false);
                        setIndex(blanks[0]!);
                      }}
                      className="inline-flex h-[52px] items-center gap-2.5 rounded-xl border-[1.5px] border-teal-100 bg-white px-5.5 text-[15px] font-medium text-teal-700 transition hover:border-teal-300"
                    >
                      <ArrowMark className="h-4 w-4 rotate-180" />
                      Answer question {blanks[0]! + 1}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => finish("manual")}
                    className="inline-flex h-[52px] items-center gap-2.5 rounded-xl bg-teal-700 px-7 text-[15px] font-medium text-white transition hover:bg-teal-600 disabled:opacity-50"
                  >
                    {submitting ? "Submitting…" : "Submit my paper"}
                    <TickMark className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="select-none">
              <div className="mb-3.5 flex items-baseline justify-between gap-4">
                <span className="text-xs font-medium tracking-[0.08em] text-gray-500 uppercase dark:text-gray-400">
                  Question {index + 1} of {questions.length}
                </span>
                {answers[question.id] ? (
                  <span className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
                    <TickMark className="h-3.5 w-3.5" />
                    Answer saved
                  </span>
                ) : null}
              </div>

              <h2 className="font-serif text-[31px] leading-[1.28] font-semibold tracking-tight text-pretty text-gray-900 dark:text-gray-50">
                {question.prompt}
              </h2>

              {question.type === "MULTIPLE_CHOICE" ? (
                <div className="mt-7 flex flex-col gap-3">
                  {(question.choices ?? []).map((choice, i) => {
                    const picked = answers[question.id] === choice;
                    return (
                      <label
                        key={choice}
                        className={`flex min-h-16 cursor-pointer items-center gap-4 rounded-xl border-[1.5px] px-5 py-3.5 text-base transition ${
                          picked
                            ? "border-teal-600 bg-teal-50 text-gray-900 shadow-[0_0_0_3px_rgba(27,65,121,0.10)] dark:bg-teal-950/60 dark:text-gray-50"
                            : "border-gray-200 bg-white text-gray-800 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`q-${question.id}`}
                          value={choice}
                          checked={picked}
                          onChange={() => onAnswer(question.id, choice)}
                          className="sr-only"
                        />
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[1.5px] text-[13px] font-medium transition ${
                            picked
                              ? "border-teal-700 bg-teal-700 text-white"
                              : "border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-400"
                          }`}
                        >
                          {String.fromCharCode(65 + i)}
                        </span>
                        {choice}
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
                  placeholder="Type your answer"
                  className="mt-7 h-16 w-full rounded-xl border-[1.5px] border-gray-200 bg-white px-5 text-base text-gray-900 outline-none transition focus:border-teal-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
              )}

              {lockdown.honeypot ? (
                <Honeypot onTrip={() => recordFlag("HONEYPOT", question.id)} />
              ) : null}

              <div className="mt-9 flex flex-wrap items-center justify-between gap-4">
                <span className="text-sm text-gray-500 tabular-nums dark:text-gray-400">
                  {/* A disabled control with no reason beside it is a dead end.
                      The sentence says what to do, not what went wrong. */}
                  {hasAnswer ? (
                    <>
                      {answered} of {questions.length} answered ·{" "}
                      {seen
                        ? "you can go back to this one from the review at the end"
                        : "you cannot read ahead, but you get one pass over your answers at the end"}
                    </>
                  ) : (
                    <span className="text-amber-800">
                      {question.type === "MULTIPLE_CHOICE"
                        ? "Choose an answer to move on."
                        : "Type an answer to move on."}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  disabled={!hasAnswer}
                  aria-disabled={!hasAnswer}
                  title={hasAnswer ? undefined : "Answer this question first"}
                  onClick={() => (seen ? setReviewing(true) : void advance())}
                  className="inline-flex h-[52px] items-center gap-2.5 rounded-xl bg-teal-700 px-7 text-[15px] font-medium text-white transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500 disabled:hover:bg-gray-200"
                >
                  {seen ? "Back to review" : isLast ? "Review my paper" : "Next question"}
                  <ArrowMark className="h-4 w-4" />
                </button>
              </div>
            </div>
          )
          ) : null}

          {submitState.error ? (
            <p role="alert" className="mt-5 text-sm text-red-600 dark:text-red-400">
              {submitState.error}
            </p>
          ) : null}
        </div>
      </div>

      <footer className="flex items-center justify-center gap-2.5 bg-gray-950 px-8 py-4 text-xs text-teal-300">
        <LockMark className="h-3.5 w-3.5" />
        {lockdown.fullscreenRequired ? "Fullscreen is required · " : ""}
        leaving this window is recorded
        {lockdown.blockCopyPaste ? " · copy and paste are disabled" : ""}
      </footer>

      <SubmitForm ref={formRef} sessionId={sessionId} action={submit} />
    </main>
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


/* Stroke-drawn on a 24px grid so they scale and recolour with the text they
   sit beside. No emoji: a glyph that renders differently on every device is
   not an icon. */
function WarnMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="M10.6 3.9 2.9 17.4A1.6 1.6 0 0 0 4.3 19.8h15.4a1.6 1.6 0 0 0 1.4-2.4L13.4 3.9a1.6 1.6 0 0 0-2.8 0Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 8.5v5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1.15" fill="currentColor" />
    </svg>
  );
}

function TickMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="M5 12h13m0 0-5.5-5.5M18 12l-5.5 5.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <rect x="4.75" y="10.5" width="14.5" height="9.75" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8.25 10.5V7.75a3.75 3.75 0 0 1 7.5 0v2.75" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-50 p-8 dark:bg-gray-950">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 border-b border-gray-200 pb-4 font-serif text-2xl font-semibold tracking-tight text-gray-900 dark:border-gray-800 dark:text-gray-50">
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
