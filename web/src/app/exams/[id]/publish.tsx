"use client";

import { classLabel } from "@/lib/classes";

import { useActionState, useState } from "react";
import { setExamStatus, setExamClasses, type ActionState } from "../actions";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Publish, take back to edit, archive, publish again.
 *
 * Publishing freezes the questions, because students may begin answering the
 * moment it is out. It used to freeze them for good: a published exam could
 * only be archived, and an archived one had no way back, so a typo found after
 * publishing could be neither fixed nor sent out again. Now Edit returns it to
 * draft — hidden from students until it is published again — and the one thing
 * that still refuses is doing that while somebody is mid-paper, which the
 * database enforces and the dialog says before anyone presses anything.
 */
export function PublishControls({
  examId,
  status,
  questionCount,
  classCount,
  submitted,
  inProgress,
}: {
  examId: string;
  status: string;
  questionCount: number;
  classCount: number;
  /** Sittings already handed in. Their scores stay as marked. */
  submitted: number;
  /** Sittings open right now. While there are any, it cannot go back to draft. */
  inProgress: number;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setExamStatus, {});
  const [dialog, setDialog] = useState<"publish" | "edit" | null>(null);

  const feedback = state.error ? (
    <p role="alert" className="text-sm text-red-700">{state.error}</p>
  ) : null;

  const linkButton =
    "text-sm font-medium text-gray-900 underline decoration-gray-300 underline-offset-[3px] hover:decoration-gray-900 disabled:opacity-50";

  const statusForm = (next: "DRAFT" | "ARCHIVED", label: string, busy: string, cls = linkButton) => (
    <form action={action} onSubmit={() => setDialog(null)}>
      <input type="hidden" name="examId" value={examId} />
      <input type="hidden" name="status" value={next} />
      <button type="submit" disabled={pending} className={cls}>
        {pending ? busy : label}
      </button>
    </form>
  );

  let controls: React.ReactNode;

  if (status === "PUBLISHED") {
    controls = (
      <div className="flex flex-wrap items-center gap-4">
        <span className="inline-flex h-6 items-center rounded-full bg-green-50 px-2.5 text-[12.5px] font-semibold text-green-800">
          Published
        </span>
        <button type="button" onClick={() => setDialog("edit")} className={linkButton}>
          Edit
        </button>
        {statusForm("ARCHIVED", "Archive", "Archiving…")}
      </div>
    );
  } else if (status === "ARCHIVED") {
    controls = (
      <div className="flex flex-wrap items-center gap-4">
        <span className="inline-flex h-6 items-center rounded-full bg-gray-100 px-2.5 text-[12.5px] font-semibold text-gray-600">
          Archived
        </span>
        {/* Students cannot see an archived exam, so there is nothing to warn
            about: straight back to draft. */}
        {statusForm("DRAFT", "Edit", "Opening…")}
        <button
          type="button"
          onClick={() => setDialog("publish")}
          disabled={questionCount === 0}
          className="inline-flex h-[38px] items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          Publish again
        </button>
      </div>
    );
  } else {
    controls = (
      <div className="flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => setDialog("publish")}
          disabled={questionCount === 0}
          className="inline-flex h-[38px] items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {submitted ? "Publish again" : "Publish"}
        </button>
        {questionCount === 0 ? (
          <span className="text-xs text-gray-500">Add a question first.</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {controls}
      {feedback}

      {dialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="status-dialog-title"
            className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl"
          >
            {dialog === "publish" ? (
              <>
                <h2 id="status-dialog-title" className="text-[15px] font-semibold text-gray-900">
                  {status === "ARCHIVED" || submitted ? "Publish this exam again?" : "Publish this exam?"}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                  Students can start it straight away, so{" "}
                  <strong className="font-semibold text-gray-900">
                    the questions and answer keys are frozen while it is published
                  </strong>
                  . To change them later, press Edit: it goes back to draft until you
                  publish it again.
                </p>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600 marker:text-gray-300">
                  <li>{plural(questionCount, "question")} will be locked</li>
                  <li>Visible to {plural(classCount, "class", "classes")}</li>
                  {submitted ? (
                    <li>
                      {plural(submitted, "student has", "students have")} already sat it. They
                      keep the score they were given.
                    </li>
                  ) : null}
                </ul>
              </>
            ) : (
              <>
                <h2 id="status-dialog-title" className="text-[15px] font-semibold text-gray-900">
                  Take this exam back to edit?
                </h2>
                {inProgress ? (
                  <p className="mt-2 text-sm leading-relaxed text-amber-800">
                    {plural(inProgress, "student is", "students are")} sitting it right now.
                    Wait until they have submitted, or close the exam first, then edit it.
                  </p>
                ) : (
                  <>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600">
                      It goes back to draft, so students cannot open it — or see their result
                      for it — until you publish it again.
                    </p>
                    {submitted ? (
                      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600 marker:text-gray-300">
                        <li>
                          {plural(submitted, "student has", "students have")} already sat it, and
                          keep the score they were given.
                        </li>
                        <li>Questions they answered can be edited, but not removed.</li>
                      </ul>
                    ) : null}
                  </>
                )}
              </>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="inline-flex h-[38px] items-center rounded-lg border border-gray-200 px-4 text-sm text-gray-700 hover:border-gray-400"
              >
                {dialog === "publish" ? "Keep editing" : "Cancel"}
              </button>
              {dialog === "publish" ? (
                <form action={action} onSubmit={() => setDialog(null)}>
                  <input type="hidden" name="examId" value={examId} />
                  <input type="hidden" name="status" value="PUBLISHED" />
                  <button
                    type="submit"
                    disabled={pending}
                    className="inline-flex h-[38px] items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                  >
                    {pending ? "Publishing…" : "Publish and lock"}
                  </button>
                </form>
              ) : inProgress ? null : (
                statusForm(
                  "DRAFT",
                  "Back to draft",
                  "Opening…",
                  "inline-flex h-[38px] items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50",
                )
              )}
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
            className="flex items-center gap-3 text-sm text-gray-800 dark:text-gray-200"
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
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {pending ? "Saving…" : "Save classes"}
        </button>
      ) : (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Locked, because the exam is published.
        </p>
      )}
    </form>
  );
}
