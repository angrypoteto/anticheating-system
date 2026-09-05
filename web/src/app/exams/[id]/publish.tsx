"use client";

import { classLabel } from "@/lib/classes";

import { useActionState, useState } from "react";
import { setExamClasses, setExamStatus, type ActionState } from "../actions";

/**
 * Publishing is one-way: the database freezes the questions and refuses to send a
 * published exam back to draft, because students may already have answered. The
 * dialog says so before the instructor commits, rather than after.
 */
export function PublishControls({
  examId,
  status,
  questionCount,
  classCount,
}: {
  examId: string;
  status: string;
  questionCount: number;
  classCount: number;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setExamStatus, {});
  const [confirming, setConfirming] = useState(false);

  if (status === "PUBLISHED") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
          Published · locked
        </span>
        <form action={action}>
          <input type="hidden" name="examId" value={examId} />
          <input type="hidden" name="status" value="ARCHIVED" />
          <button
            type="submit"
            disabled={pending}
            className="text-sm text-slate-600 underline underline-offset-4 hover:text-slate-900 disabled:opacity-50 dark:text-slate-400 dark:hover:text-slate-100"
          >
            {pending ? "…" : "Archive"}
          </button>
        </form>
        {state.error ? (
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{state.error}</p>
        ) : null}
      </div>
    );
  }

  if (status === "ARCHIVED") {
    return (
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
        Archived
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={questionCount === 0}
        className="rounded-md bg-indigo-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-800 disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-500"
      >
        Publish
      </button>
      {questionCount === 0 ? (
        <span className="text-xs text-slate-500 dark:text-slate-400">Add a question first.</span>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{state.error}</p>
      ) : null}

      {confirming ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="publish-title"
            className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <h2 id="publish-title" className="text-lg font-medium text-slate-900 dark:text-slate-50">
              Publish this exam?
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Once published, <strong className="text-slate-900 dark:text-slate-100">
              the questions and answer keys can no longer be changed</strong>, and the
              exam cannot be returned to draft. Students may begin answering
              immediately, which is exactly why it is frozen.
            </p>
            <ul className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-400">
              <li>· {questionCount} question{questionCount === 1 ? "" : "s"} will be locked</li>
              <li>· Visible to {classCount} class{classCount === 1 ? "" : "es"}</li>
              <li>· You can still archive it later to withdraw it</li>
            </ul>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Keep editing
              </button>
              <form action={action} onSubmit={() => setConfirming(false)}>
                <input type="hidden" name="examId" value={examId} />
                <input type="hidden" name="status" value="PUBLISHED" />
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-indigo-700 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-800 disabled:opacity-50 dark:bg-indigo-600"
                >
                  {pending ? "Publishing…" : "Publish and lock"}
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** An exam can be delivered to any class the instructor holds. */
export function ClassTargets({
  examId,
  allClasses,
  selected,
  locked,
}: {
  examId: string;
  allClasses: { id: string; name: string; subject?: string | null }[];
  selected: string[];
  locked: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setExamClasses, {});

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="examId" value={examId} />
      <div className="space-y-2">
        {allClasses.map((c) => (
          <label
            key={c.id}
            className="flex items-center gap-3 text-sm text-slate-800 dark:text-slate-200"
          >
            <input
              type="checkbox"
              name="sectionIds"
              value={c.id}
              defaultChecked={selected.includes(c.id)}
              disabled={locked}
            />
            {classLabel(c)}
          </label>
        ))}
        {allClasses.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">You hold no classes yet.</p>
        ) : null}
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{state.error}</p>
      ) : null}
      {state.success ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{state.success}</p>
      ) : null}

      {!locked ? (
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {pending ? "Saving…" : "Save classes"}
        </button>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Locked — the exam is published.
        </p>
      )}
    </form>
  );
}
