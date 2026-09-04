"use client";

import { useActionState } from "react";
import { joinClass, type JoinState } from "./join-actions";

/** Add another subject from its class code, the way you would in Classroom. */
export function JoinClassForm() {
  const [state, action, pending] = useActionState<JoinState, FormData>(joinClass, {});

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div>
        <label
          htmlFor="join-code"
          className="block text-xs font-medium text-gray-700 dark:text-gray-300"
        >
          Class code
        </label>
        <input
          id="join-code"
          name="code"
          required
          maxLength={12}
          placeholder="A1B2C3"
          className="mt-1 w-36 rounded-md border border-gray-300 px-3 py-2 font-mono text-sm uppercase tracking-widest text-gray-900 outline-none focus:border-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-gray-400"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
      >
        {pending ? "Joining…" : "Join class"}
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
