"use client";

import { useActionState } from "react";
import { setExamWindow, type ActionState } from "./actions";

/**
 * Close a paper from the list it is listed in.
 *
 * Closing was reachable only from the editor's scheduling control, which meant
 * a teacher who could see "Open" on a row had to open the exam and find a
 * different control to act on what the row had just told them. The action is
 * the same one the editor uses, so the closing time is still stamped by the
 * database rather than by whichever page asked.
 */
export function CloseExam({ examId }: { examId: string }) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(setExamWindow, {});

  return (
    <form action={submit} className="inline-flex flex-wrap items-center gap-2.5">
      <input type="hidden" name="examId" value={examId} />
      <input type="hidden" name="mode" value="close" />
      <button
        type="submit"
        disabled={pending}
        className="border-b border-teal-100 pb-px text-teal-700 hover:border-teal-700 disabled:opacity-50"
      >
        {pending ? "Closing…" : "Close now"}
      </button>
      {state.error ? (
        <span role="alert" className="text-[13px] text-red-700">
          {state.error}
        </span>
      ) : null}
      {state.success ? (
        <span role="status" className="text-[13px] text-green-700">
          {state.success}
        </span>
      ) : null}
    </form>
  );
}
