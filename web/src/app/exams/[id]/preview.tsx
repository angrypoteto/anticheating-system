"use client";

import { useState } from "react";
import { seededShuffle, choiceOrderSeed, questionOrderSeed } from "@/lib/shuffle";
import type { LockdownConfig, TimerConfig } from "@/lib/exam-config";

export type PreviewQuestion = {
  id: string;
  type: string;
  prompt: string;
  choices: string[] | null;
};

/**
 * Shows the paper as a student meets it — one question at a time, shuffled.
 * The seed is a fake session id, so the instructor sees a genuine shuffle rather
 * than their own authoring order, and can step through to check every item.
 */
export function ExamPreview({
  questions,
  timer,
  lockdown,
  title,
}: {
  questions: PreviewQuestion[];
  timer: TimerConfig;
  lockdown: LockdownConfig;
  title: string;
}) {
  const [seed, setSeed] = useState("preview-session-1");
  const [index, setIndex] = useState(0);

  const ordered = seededShuffle(questions, questionOrderSeed(seed));
  const q = ordered[Math.min(index, Math.max(ordered.length - 1, 0))];
  const choices = q?.choices ? seededShuffle(q.choices, choiceOrderSeed(seed, q.id)) : null;

  if (!questions.length) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        Add a question and it will appear here exactly as a student sees it.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
        {/* Mirrors the real runner's header so the instructor sees what students see. */}
        <div className="mb-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>
            Question {Math.min(index + 1, ordered.length)} of {ordered.length}
          </span>
          <span className="flex gap-3">
            {timer.perQuestionSeconds ? <span>Q {timer.perQuestionSeconds}s</span> : null}
            {timer.totalMinutes > 0 ? <span>{timer.totalMinutes}:00</span> : null}
          </span>
        </div>

        <p className="text-sm text-gray-900 dark:text-gray-100">{q?.prompt}</p>

        {choices ? (
          <div className="mt-3 space-y-2">
            {choices.map((c) => (
              <div
                key={c}
                className="flex items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              >
                <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-gray-400 dark:border-gray-500" />
                {c}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-900">
            short answer…
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            className="text-xs text-gray-500 underline underline-offset-4 disabled:opacity-40 dark:text-gray-400"
          >
            ← previous
          </button>
          <span className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-gray-100 dark:text-gray-900">
            {index >= ordered.length - 1 ? "Submit exam" : "Next question"}
          </span>
          <button
            type="button"
            onClick={() => setIndex((i) => Math.min(ordered.length - 1, i + 1))}
            disabled={index >= ordered.length - 1}
            className="text-xs text-gray-500 underline underline-offset-4 disabled:opacity-40 dark:text-gray-400"
          >
            next →
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span>
          {lockdown.fullscreenRequired ? "Fullscreen · " : ""}
          {lockdown.blockCopyPaste ? "No copy-paste · " : ""}
          {lockdown.maxStrikes} strikes
          {lockdown.honeypot ? " · honeypot" : ""}
        </span>
        <button
          type="button"
          onClick={() => {
            setSeed(`preview-session-${Math.random().toString(36).slice(2, 8)}`);
            setIndex(0);
          }}
          className="underline underline-offset-4 hover:text-gray-900 dark:hover:text-gray-100"
        >
          Shuffle as another student
        </button>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        Preview of &ldquo;{title}&rdquo;. Every student gets their own order, so no two
        papers match.
      </p>
    </div>
  );
}
