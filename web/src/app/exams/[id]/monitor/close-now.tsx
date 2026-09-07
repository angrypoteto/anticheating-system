"use client";

import { useActionState } from "react";
import { setExamWindow, type ActionState } from "../../actions";

/**
 * Close the paper from the screen you are watching it on.
 *
 * A teacher who decides mid-sitting that this has gone far enough should not
 * have to leave the monitor, find the editor and hunt for a scheduling control
 * to do it. The action is the same one the editor uses, so the closing time is
 * still stamped by the database rather than by whichever page asked.
 */
export function CloseNow({ examId }: { examId: string }) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(setExamWindow, {});

  return (
    <form action={submit} className="flex shrink-0 items-center gap-3">
      <input type="hidden" name="examId" value={examId} />
      <input type="hidden" name="mode" value="close" />
      {state.error ? (
        <span role="alert" className="text-[13px] text-red-700">
          {state.error}
        </span>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-8.5 items-center rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-700 transition hover:border-gray-300 hover:text-gray-900 disabled:opacity-50"
      >
        {pending ? "Closing…" : "Close now"}
      </button>
    </form>
  );
}
