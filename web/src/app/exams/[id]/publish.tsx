"use client";

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
        <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-800 dark:bg-green-950/60 dark:text-green-300">
          Published · locked
        </span>
        <form action={action}>
          <input type="hidden" name="examId" value={examId} />
          <input type="hidden" name="status" value="ARCHIVED" />
          <button
            type="submit"
            disabled={pending}
            className="text-sm text-gray-600 underline underline-offset-4 hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-100"
          >
            {pending ? "…" : "Archive"}
          </button>
        </form>
        {state.error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
        ) : null}
      </div>
    );
  }

  if (status === "ARCHIVED") {
    return (
      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
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
        className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500"
      >
        Publish
      </button>
      {questionCount === 0 ? (
        <span className="text-xs text-gray-500 dark:text-gray-400">Add a question first.</span>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : null}

      {confirming ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="publish-title"
            className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-800 dark:bg-gray-900"
          >
            <h2 id="publish-title" className="text-lg font-medium text-gray-900 dark:text-gray-50">
              Publish this exam?
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Once published, <strong className="text-gray-900 dark:text-gray-100">
              the questions and answer keys can no longer be changed</strong>, and the
              exam cannot be returned to draft. Students may begin answering
              immediately, which is exactly why it is frozen.
            </p>
            <ul className="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-400">
              <li>· {questionCount} question{questionCount === 1 ? "" : "s"} will be locked</li>
              <li>· Visible to {classCount} class{classCount === 1 ? "" : "es"}</li>
              <li>· You can still archive it later to withdraw it</li>
            </ul>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Keep editing
              </button>
              <form action={action} onSubmit={() => setConfirming(false)}>
                <input type="hidden" name="examId" value={examId} />
                <input type="hidden" name="status" value="PUBLISHED" />
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-600"
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
  allClasses: { id: string; name: string }[];
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
            className="flex items-center gap-3 text-sm text-gray-800 dark:text-gray-200"
          >
            <input
              type="checkbox"
              name="sectionIds"
              value={c.id}
              defaultChecked={selected.includes(c.id)}
              disabled={locked}
            />
            {c.name}
          </label>
        ))}
        {allClasses.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">You hold no classes yet.</p>
        ) : null}
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : null}
      {state.success ? (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">{state.success}</p>
      ) : null}

      {!locked ? (
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {pending ? "Saving…" : "Save classes"}
        </button>
      ) : (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Locked — the exam is published.
        </p>
      )}
    </form>
  );
}
