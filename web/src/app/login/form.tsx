"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";
import { authButton, authField, authLabel } from "@/components/auth-shell";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div>
        <label htmlFor="email" className={authLabel}>
          Email
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

      <div>
        <label htmlFor="password" className={authLabel}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={authField}
        />
      </div>

      {state?.error ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-200/70 bg-rose-50 px-3.5 py-2.5 text-sm leading-relaxed text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
        >
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={authButton}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
