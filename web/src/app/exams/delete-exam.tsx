"use client";

import { useActionState } from "react";
import { deleteExam, type DeleteExamState } from "./actions";

/**
 * Deleting an exam, asked twice.
 *
 * The first press does not delete anything — it asks the database what would go
 * and shows the answer. A confirmation that says "are you sure?" and nothing
 * else is asking somebody to agree to a number they have not been told, and the
 * number here is other people's results.
 */
export function DeleteExam({
  examId,
  title,
  stay = false,
}: {
  examId: string;
  title: string;
  /** True in a list, where there is somewhere to stay; false in the editor. */
  stay?: boolean;
}) {
  const [state, submit, pending] = useActionState<DeleteExamState, FormData>(deleteExam, {});
  const asked = state.confirm;

  return (
    <form action={submit} className="inline">
      <input type="hidden" name="examId" value={examId} />
      {stay ? <input type="hidden" name="stay" value="yes" /> : null}

      {asked ? (
        <span className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-red-700 dark:text-red-400">
            Delete “{asked.title}” and{" "}
            {asked.sittings
              ? `${asked.sittings} sitting${asked.sittings === 1 ? "" : "s"} with ${asked.answers} answer${asked.answers === 1 ? "" : "s"}`
              : `its ${asked.questions} question${asked.questions === 1 ? "" : "s"}`}
            ? This cannot be undone.
          </span>
          <button
            type="submit"
            name="confirm"
            value="yes"
            disabled={pending}
            className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Yes, delete"}
          </button>
        </span>
      ) : (
        <button
          type="submit"
          disabled={pending}
          className="text-sm text-red-700 underline underline-offset-4 hover:text-red-800 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
        >
          {pending ? "…" : "Delete"}
        </button>
      )}

      {state.error ? (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      <span className="sr-only">{title}</span>
    </form>
  );
}
