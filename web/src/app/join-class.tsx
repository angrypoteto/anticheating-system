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
          className="block text-xs font-semibold text-slate-600 dark:text-slate-300"
        >
          Class code
        </label>
        <input
          id="join-code"
          name="code"
          required
          maxLength={12}
          placeholder="A1B2C3"
          className="mt-1.5 w-40 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 font-mono text-sm uppercase tracking-[0.18em] text-slate-900 shadow-[inset_0_1px_2px_rgb(15_23_42/0.04)] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-indigo-400"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
      >
        {pending ? "Joining…" : "Join class"}
      </button>
      {state.error ? (
        <p role="alert" className="w-full rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="w-full rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
