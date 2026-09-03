"use client";

import { useActionState } from "react";
import { createExam, type ActionState } from "./actions";

const field =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-gray-400";
const label = "block text-sm font-medium text-gray-700 dark:text-gray-300";
const button =
  "rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300";

export function CreateExamForm({
  sections,
}: {
  sections: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createExam,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="title" className={label}>
            Exam title
          </label>
          <input
            id="title"
            name="title"
            placeholder="Midterm Exam"
            required
            className={field}
          />
        </div>
        <div>
          <label htmlFor="sectionId" className={label}>
            Section
          </label>
          <select id="sectionId" name="sectionId" required defaultValue="" className={field}>
            <option value="" disabled>
              {sections.length ? "— pick one —" : "— no sections assigned —"}
            </option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || sections.length === 0}
        className={button}
      >
        {pending ? "Creating…" : "Create exam"}
      </button>
    </form>
  );
}
