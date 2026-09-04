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
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Left: the pitch. Hidden on small screens so the form leads on a phone. */}
      <section className="hidden flex-col justify-between bg-teal-800 p-12 text-teal-50 lg:flex">
        <Link href="/" className="flex items-center gap-3 font-semibold text-white">
          <ShieldMark className="h-8 w-8" />
          Proctorly
        </Link>

        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight text-white">
            Exams your students can&apos;t quietly game.
          </h2>
          <p className="mt-4 text-teal-100">
            Lockdown mode, live proctoring and question sets drafted from your own
            lesson files — with every flag on the record.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-teal-100">
            {[
              "Fullscreen exams with tab-switch detection",
              "Flags reach the instructor in under a second",
              "Answer keys unreadable to students by design",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <span aria-hidden className="mt-1 text-teal-300">
                  ✓
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-teal-200/70">
          BSIT 4C · Group 2 — System Administration project
        </p>
      </section>

      {/* Right: the form. */}
      <section className="flex items-center justify-center bg-gray-50 p-6 dark:bg-gray-950">
        <div className="w-full max-w-sm">
          <Link
            href="/"
            className="mb-8 flex items-center gap-2 font-semibold text-gray-900 lg:hidden dark:text-gray-50"
          >
            <ShieldMark className="h-7 w-7" />
            Proctorly
          </Link>

          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
            {title}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>

          <div className="mt-8">{children}</div>

          <div className="mt-6 text-sm text-gray-500 dark:text-gray-400">{footer}</div>
        </div>
      </section>
    </main>
  );
}

export function ShieldMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#0d9488" />
      <path
        d="M16 5.2 25 9.1v6.8c0 5.4-3.8 9.4-9 10.9-5.2-1.5-9-5.5-9-10.9V9.1z"
        fill="#fff"
      />
      <path
        d="M11.4 16.1 14.6 19.3 20.6 13.2"
        fill="none"
        stroke="#0d9488"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const authField =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-teal-500";
export const authLabel =
  "block text-sm font-medium text-gray-700 dark:text-gray-300";
export const authButton =
  "w-full rounded-md bg-teal-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600/40 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500";
