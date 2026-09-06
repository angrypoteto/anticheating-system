"use client";

import { useActionState } from "react";
import { joinSection, type JoinState } from "./join-actions";

export type PickableSection = { id: string; label: string; instructor: string | null };

/**
 * Add another subject by choosing it, the way the sign-up step does.
 *
 * It used to take a six-character code. A code works when a teacher is stood in
 * front of you saying it out loud; it is no use at all to a student adding a
 * second subject at home. The list is the admin's — creating a section is an
 * admin-only action — so what can be picked here is exactly what has been set up.
 */
export function JoinClassForm({ sections }: { sections: PickableSection[] }) {
  const [state, action, pending] = useActionState<JoinState, FormData>(joinSection, {});

  if (!sections.length) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No other sections to join.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div>
        <label
          htmlFor="join-section"
          className="block text-xs font-medium text-gray-700 dark:text-gray-300"
        >
          Add a section
        </label>
        <select
          id="join-section"
          name="sectionId"
          required
          defaultValue=""
          className="mt-1 min-w-56 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-gray-400"
        >
          <option value="" disabled>
            Choose a section…
          </option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
              {s.instructor ? ` — ${s.instructor}` : ""}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
      >
        {pending ? "Joining…" : "Join"}
      </button>
      {state.error ? (
        <p role="alert" className="w-full text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="w-full text-sm text-green-700 dark:text-green-400">
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
