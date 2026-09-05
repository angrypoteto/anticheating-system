"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * "Continue with Google".
 *
 * The redirect has to be started in the browser so Supabase can keep the PKCE
 * verifier it will need on the way back; the code it returns with is exchanged
 * for a session server-side, in /auth/callback.
 */
export function GoogleButton({
  next,
  label = "Continue with Google",
}: {
  next?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const callback = new URL("/auth/callback", window.location.origin);
    if (next) callback.searchParams.set("next", next);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() },
    });

    if (error) {
      setBusy(false);
      setError(
        /provider is not enabled/i.test(error.message)
          ? "Google sign-in is not switched on for this site yet. Ask your administrator, or use your email and password."
          : error.message,
      );
    }
    // On success the browser leaves for Google, so there is nothing to reset.
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <svg viewBox="0 0 18 18" aria-hidden className="h-4.5 w-4.5" width="18" height="18">
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.94v2.33A9 9 0 0 0 9 18Z"
          />
          <path
            fill="#FBBC05"
            d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.94a9 9 0 0 0 0 8.1l3.04-2.33Z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .94 4.95l3.04 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
          />
        </svg>
        {busy ? "Taking you to Google…" : label}
      </button>

      {error ? (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] leading-relaxed text-rose-700 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A labelled rule between the Google button and the email form. */
export function AuthDivider({ children = "or" }: { children?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {children}
      </span>
      <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
    </div>
  );
}
