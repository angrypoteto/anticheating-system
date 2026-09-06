"use client";

import { useActionState } from "react";
import { signup, type SignupState } from "./actions";
import { authButton, authField, authLabel } from "@/components/auth-shell";

export type PickableSection = { id: string; label: string; instructor: string | null };

export function SignupForm({
  sections,
  next,
}: {
  /** Empty when the school assigns classes itself, or has none yet. */
  sections: PickableSection[];
  next?: string;
}) {
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

      {sections.length ? (
        <div>
          <label htmlFor="sectionId" className={authLabel}>
            Your section
          </label>
          {/* The list an admin set up, rather than a code read off a
              whiteboard: nobody is stood next to you saying one out loud at the
              moment you register. */}
          <select id="sectionId" name="sectionId" required defaultValue="" className={authField}>
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
            Pick the one you are enrolled in. Your teacher can move you later.
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
