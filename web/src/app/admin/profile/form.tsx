"use client";

import { useActionState } from "react";
import { saveProfile, type ProfileState } from "./actions";

const field =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const label = "block text-sm font-medium text-slate-700 dark:text-slate-300";

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
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            3–30 characters: letters, numbers, dot, dash or underscore.
          </p>
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          {state.success}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-indigo-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-800 disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-500"
      >
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
