import Link from "next/link";

/**
 * Shared chrome for the sign-in and sign-up screens.
 *
 * A split: the case for the product on the left, the form on the right. The
 * left half is hidden below `lg` so a phone gets the form and nothing else —
 * somebody signing in on a phone has already decided.
 */
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
      <section className="hidden flex-col justify-between bg-gray-900 p-11 text-white lg:flex">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-[16px] font-bold tracking-tight text-white"
        >
          <ShieldMark className="h-6 w-6" />
          Proctorly
        </Link>

        <div className="max-w-md">
          <h2 className="text-[36px] leading-[1.15] font-semibold tracking-[-0.025em] text-pretty text-white">
            Exams your students can&rsquo;t quietly game.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-gray-300">
            Lockdown sittings, proctoring that reaches you in under a second, and
            question sets drafted from your own lesson files.
          </p>
          <ul className="mt-8 flex flex-col gap-3.5">
            {[
              "Fullscreen papers that pause the moment a student leaves them",
              "One departure is one warning, never three for the same glance away",
              "Answer keys unreadable to students by design",
            ].map((t) => (
              <li key={t} className="flex gap-3 text-sm leading-relaxed text-gray-300">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                  className="mt-0.5 h-4 w-4 shrink-0 text-white"
                >
                  <path
                    d="m5 12.5 4.5 4.5L19 7.5"
                    stroke="currentColor"
                    strokeWidth="2.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[12.5px] text-gray-400">
          A System Administration project by BSIT 4C, Group 2
        </p>
      </section>

      <section className="flex items-center justify-center bg-gray-50 p-6 sm:p-11">
        <div className="w-full max-w-[392px]">
          <Link
            href="/"
            className="mb-8 flex items-center gap-2.5 font-bold text-gray-900 lg:hidden"
          >
            <ShieldMark className="h-6 w-6" ground="light" />
            Proctorly
          </Link>

          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em] text-gray-900">
            {title}
          </h1>
          <p className="mt-1.5 text-[14.5px] text-gray-500">{subtitle}</p>

          <div className="mt-7.5">{children}</div>

          <div className="mt-6 text-sm text-gray-500">{footer}</div>
        </div>
      </section>
    </main>
  );
}

/**
 * The mark, in the accent step its ground can carry: ink on the light pages,
 * white on the one dark panel (the sign-in split). It takes the accent tokens
 * rather than inheriting currentColor, so it stays constant while the text
 * around it changes.
 *
 * The outline sits at 0.8 rather than full strength so the tick reads as the
 * figure and the shield as its enclosure.
 */
export function ShieldMark({
  className,
  ground = "dark",
}: {
  className?: string;
  /** The surface it sits on — "dark" is the navy chrome, "light" the pages. */
  ground?: "dark" | "light";
}) {
  const teal = ground === "dark" ? "var(--color-accent-bright)" : "var(--color-accent)";
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 2.75 4.75 5.5v6.02c0 4.34 2.94 8.4 7.25 9.73 4.31-1.33 7.25-5.39 7.25-9.73V5.5L12 2.75Z"
        stroke={teal}
        strokeOpacity="0.8"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m8.9 12.1 2.15 2.15 4.05-4.5"
        stroke={teal}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const authField =
  "mt-1.5 h-[46px] w-full rounded-lg border border-gray-200 bg-white px-3.5 text-[14.5px] text-gray-900 outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900";
export const authLabel = "block text-[13.5px] font-medium text-gray-700";
export const authButton =
  "h-[46px] w-full rounded-lg bg-gray-900 text-[15px] font-medium text-white hover:bg-gray-700 disabled:opacity-50 disabled:hover:bg-gray-900";
