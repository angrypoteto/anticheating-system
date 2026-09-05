"use client";

import { useActionState } from "react";
import { signup, type SignupState } from "./actions";
import { authButton, authField, authLabel } from "@/components/auth-shell";

export function SignupForm({ useClasses, next }: { useClasses: boolean; next?: string }) {
  const [state, action, pending] = useActionState<SignupState, FormData>(signup, {});

  return (
    <form action={action} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div>
        <label htmlFor="email" className={authLabel}>
          School email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={authField}
        />
      </div>

      {useClasses ? (
        <div>
          <label htmlFor="code" className={authLabel}>
            Class code
          </label>
        <input
          id="code"
          name="code"
          required
          placeholder="e.g. EE7D24"
          autoCapitalize="characters"
          className={`${authField} font-mono uppercase tracking-widest`}
        />
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Your instructor gives you this. It puts you in the right class.
          </p>
        </div>
      ) : null}

      <div>
        <label htmlFor="password" className={authLabel}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className={authField}
        />
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          At least 8 characters.
        </p>
      </div>

      <div>
        <label htmlFor="confirm" className={authLabel}>
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          className={authField}
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-200/70 bg-rose-50 px-3.5 py-2.5 text-sm leading-relaxed text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
        >
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={authButton}>
        {pending ? "Creating your account…" : "Create account"}
      </button>
    </form>
  );
}
