"use client";

import { useActionState } from "react";
import { completeProfile, type WelcomeState } from "./actions";

export type PickableSection = { id: string; label: string; instructor: string | null };

export function WelcomeForm({
  askName,
  askSection,
  sections,
  suggestedName,
  next,
}: {
  askName: boolean;
  askSection: boolean;
  sections: PickableSection[];
  suggestedName: string;
  next: string;
}) {
  const [state, submit, pending] = useActionState<WelcomeState, FormData>(
    completeProfile,
    {},
  );

  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      {askName ? (
        <div>
          <label
            htmlFor="fullName"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Your full name
          </label>
          {/* Google supplies a name with the account; offering it back saves
              typing, and it stays editable because the name on a class list is
              not always the one on a Google profile. */}
          <input
            id="fullName"
            name="fullName"
            type="text"
            required
            autoFocus
            defaultValue={suggestedName}
            autoComplete="name"
            placeholder="Juan D. Dela Cruz"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            This is the name your teacher sees beside your score.
          </p>
        </div>
      ) : null}

      {askSection ? (
        <div>
          <label
            htmlFor="sectionId"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Your section
          </label>
          {/* A list rather than a six-character code: a student knows which
              section they are in, and nobody is stood in front of them saying a
              code out loud at the moment they sign up. */}
          <select
            id="sectionId"
            name="sectionId"
            required
            autoFocus={!askName}
            defaultValue=""
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          >
            <option value="" disabled>
              Choose your section…
            </option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
                {s.instructor ? ` — ${s.instructor}` : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Pick the one you are enrolled in. Your teacher can move you if it is
            wrong.
          </p>
        </div>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Finish setting up"}
      </button>
    </form>
  );
}
