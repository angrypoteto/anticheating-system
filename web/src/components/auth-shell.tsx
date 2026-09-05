import Link from "next/link";

/** Shared chrome for the sign-in and sign-up screens. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Left: the pitch. Hidden on small screens so the form leads on a phone. */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-slate-950 p-12 text-slate-200 lg:flex">
        {/* Ambient gradient + grid — present, not loud */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full bg-indigo-600/40 blur-[110px]" />
          <div className="absolute top-1/3 -right-28 h-[380px] w-[380px] rounded-full bg-violet-600/25 blur-[110px]" />
          <div className="absolute bottom-0 left-1/4 h-[260px] w-[420px] rounded-full bg-sky-500/20 blur-[100px]" />
          <div className="bg-grid-slate mask-fade-b absolute inset-0 opacity-60" />
        </div>

        <Link
          href="/"
          className="relative flex items-center gap-3 font-semibold text-white"
        >
          <ShieldMark className="h-9 w-9" />
          <span className="text-[17px] tracking-tight">
            Proctorly
            <span className="ml-2 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 align-middle text-[11px] font-medium text-indigo-100">
              BSIT 4C · Group 2
            </span>
          </span>
        </Link>

        <div className="relative max-w-md">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-medium text-indigo-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Live proctoring · Lockdown mode · AI drafts
          </p>
          <h2 className="mt-5 text-[34px] font-semibold leading-[1.12] tracking-tight text-white">
            Exams your students can&apos;t quietly game.
          </h2>
          <p className="mt-4 leading-relaxed text-slate-300">
            Lockdown mode, live proctoring and question sets drafted from your
            own lesson files — with every flag on the record.
          </p>
          <ul className="mt-8 space-y-3.5 text-sm text-slate-200">
            {[
              ["Fullscreen exams with tab-switch detection", "Lockdown"],
              ["Flags reach the instructor in under a second", "Live"],
              ["Answer keys unreadable to students by design", "Secure"],
            ].map(([t, k]) => (
              <li
                key={t}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 backdrop-blur"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-200">
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
                    <path
                      d="M3.5 8.5 6.5 11.5 12.5 4.5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span>
                  <span className="mr-2 rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-100">
                    {k}
                  </span>
                  {t}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center justify-between text-xs text-slate-400">
          <p>System Administration course project</p>
          <p className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            All systems monitored
          </p>
        </div>
      </section>

      {/* Right: the form. */}
      <section className="relative flex items-center justify-center bg-slate-50 p-6 sm:p-10 dark:bg-slate-950">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 right-0 h-72 w-72 rounded-full bg-indigo-500/[0.08] blur-[80px]" />
        </div>
        <div className="relative w-full max-w-[400px]">
          <Link
            href="/"
            className="mb-8 flex items-center gap-2 font-semibold text-slate-900 lg:hidden dark:text-white"
          >
            <ShieldMark className="h-8 w-8" />
            Proctorly
          </Link>

          <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_1px_2px_rgb(15_23_42/0.05),0_12px_32px_-12px_rgb(15_23_42/0.12)] sm:p-8 dark:border-slate-800 dark:bg-slate-900">
            <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 dark:text-white">
              {title}
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>

            <div className="mt-6">{children}</div>

            <div className="mt-6 border-t border-slate-100 pt-5 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
              {footer}
            </div>
          </div>

          <p className="mt-5 text-center text-xs text-slate-400 dark:text-slate-500">
            Protected by row-level security · Audit log is append-only
          </p>
        </div>
      </section>
    </main>
  );
}

export function ShieldMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="pk-shield" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="55%" stopColor="#4f46e5" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#pk-shield)" />
      <rect x="1" y="1" width="30" height="30" rx="8" fill="none" stroke="#ffffff" strokeOpacity="0.25" />
      <path
        d="M16 5.4 24.6 9.2v6.5c0 5.2-3.6 9-8.6 10.5-5-1.5-8.6-5.3-8.6-10.5V9.2z"
        fill="#ffffff"
        fillOpacity="0.96"
      />
      <path
        d="M11.6 16.1 14.7 19.2 20.4 13.3"
        fill="none"
        stroke="#4f46e5"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const authField =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm text-slate-900 shadow-[inset_0_1px_2px_rgb(15_23_42/0.04)] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:border-slate-600 dark:focus:border-indigo-400 dark:focus:bg-slate-900";
export const authLabel =
  "block text-[13px] font-medium text-slate-700 dark:text-slate-300";
export const authButton =
  "w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_1px_2px_rgb(79_70_229/0.4),0_8px_16px_-8px_rgb(79_70_229/0.6)] transition hover:bg-indigo-700 hover:shadow-[0_8px_20px_-8px_rgb(79_70_229/0.7)] focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/30 active:bg-indigo-800 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:active:bg-indigo-500";
