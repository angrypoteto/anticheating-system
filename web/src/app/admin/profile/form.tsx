"use client";

import { useActionState } from "react";
import { saveProfile, type ProfileState } from "./actions";

const field =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100";
const label = "block text-sm font-medium text-gray-700 dark:text-gray-300";

export function ProfileForm({
  fullName,
  username,
}: {
  fullName: string;
  username: string;
}) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfile, {});

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="fullName" className={label}>Full name</label>
          <input
            id="fullName"
            name="fullName"
            defaultValue={fullName}
            placeholder="Juan Dela Cruz"
            className={field}
          />
        </div>
        <div>
          <label htmlFor="username" className={label}>Username</label>
          <input
            id="username"
            name="username"
            defaultValue={username}
            placeholder="juandc"
            className={field}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            3–30 characters: letters, numbers, dot, dash or underscore.
          </p>
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
          {state.success}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-teal-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500"
      >
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
