"use client";

import { useActionState } from "react";
import { completeProfile, type WelcomeState } from "./actions";

export function WelcomeForm({
  askName,
  askCode,
  suggestedName,
  next,
}: {
  askName: boolean;
  askCode: boolean;
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

      {askCode ? (
        <div>
          <label
            htmlFor="code"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Class code
          </label>
          <input
            id="code"
            name="code"
            type="text"
            required
            autoFocus={!askName}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="A1B2C3"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm uppercase tracking-widest text-gray-900 outline-none focus:border-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Your teacher gives this out — six characters.
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
