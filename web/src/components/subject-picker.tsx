"use client";

import { useState } from "react";

export type SubjectOption = { id: string; name: string };

/**
 * Pick a subject, or name one that does not exist yet.
 *
 * Typed once and picked thereafter — the point is that "System Administration"
 * is spelled the same way on every paper, rather than each teacher inventing
 * their own capitalisation of it.
 */
export function SubjectPicker({
  subjects,
  defaultId,
  required,
}: {
  subjects: SubjectOption[];
  defaultId?: string | null;
  required?: boolean;
}) {
  const [choice, setChoice] = useState(defaultId ?? "");

  const field =
    "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-gray-400";

  return (
    <div>
      <label
        htmlFor="subjectId"
        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        Subject{required ? "" : " (optional)"}
      </label>

      <select
        id="subjectId"
        name="subjectId"
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        className={field}
      >
        <option value="">{subjects.length ? "— pick one —" : "— none yet —"}</option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
        <option value="__new">+ Add a new subject…</option>
      </select>

      {choice === "__new" ? (
        <>
          <label htmlFor="newSubject" className="sr-only">
            New subject name
          </label>
          <input
            id="newSubject"
            name="newSubject"
            autoFocus
            required
            placeholder="e.g. System Administration"
            className={field}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Saved to the list, so you can pick it next time instead of typing it.
          </p>
        </>
      ) : null}
    </div>
  );
}
