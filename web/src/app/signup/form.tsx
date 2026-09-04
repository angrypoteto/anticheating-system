"use client";

import { useActionState } from "react";
import { signup, type SignupState } from "./actions";
import { authButton, authField, authLabel } from "@/components/auth-shell";

export function SignupForm({ useClasses }: { useClasses: boolean }) {
  const [state, action, pending] = useActionState<SignupState, FormData>(signup, {});

  return (
    <form action={action} className="space-y-4">
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
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
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
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
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
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
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
