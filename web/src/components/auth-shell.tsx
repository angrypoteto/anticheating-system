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
      <section className="relative hidden flex-col justify-between overflow-hidden bg-gray-900 p-11 text-white lg:flex">
        {/* A single soft light behind the type, so the panel has depth without
            becoming a gradient wash. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -bottom-50 h-[520px] w-[520px] rounded-full"
          style={{
            background:
              "radial-gradient(circle at 30% 30%, rgba(78,121,184,0.30), transparent 68%)",
          }}
        />

        <Link
          href="/"
          className="relative z-10 flex items-center gap-3 text-[17px] font-semibold tracking-tight text-white"
        >
          <ShieldMark className="h-7 w-7" />
          Proctorly
        </Link>

        <div className="relative z-10 max-w-md">
          <h2 className="font-serif text-[38px] leading-[1.18] font-semibold tracking-tight text-pretty text-white">
            Exams your students can&rsquo;t quietly game.
          </h2>
          <p className="mt-4.5 text-[15px] leading-relaxed text-teal-100">
            Lockdown sittings, proctoring that reaches you in under a second, and
            question sets drafted from your own lesson files.
          </p>
          <ul className="mt-8 flex flex-col gap-3.5">
            {[
              "Fullscreen papers that pause the moment a student leaves them",
              "One departure is one warning — never three for the same glance away",
              "Answer keys unreadable to students by design",
            ].map((t) => (
              <li key={t} className="flex gap-3 text-sm leading-relaxed text-teal-100">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                  className="mt-0.5 h-4 w-4 shrink-0 text-teal-400"
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

        <p className="relative z-10 text-[12.5px] text-teal-300">
          BSIT 4C · Group 2 — System Administration project
        </p>
      </section>

      <section className="flex items-center justify-center bg-gray-50 p-6 sm:p-11">
        <div className="w-full max-w-[392px]">
          <Link
            href="/"
            className="mb-8 flex items-center gap-2.5 font-semibold text-gray-900 lg:hidden"
          >
            <ShieldMark className="h-7 w-7" ground="light" />
            Proctorly
          </Link>

          <h1 className="font-serif text-3xl font-semibold tracking-tight text-gray-900">
            {title}
          </h1>
          <p className="mt-2 text-[14.5px] text-gray-500">{subtitle}</p>

          <div className="mt-7.5">{children}</div>

          <div className="mt-6 text-sm text-gray-500">{footer}</div>
        </div>
      </section>
    </main>
  );
}

/**
 * The mark. Drawn in currentColor rather than a fixed brand hex, because it
 * sits on navy chrome as often as on ivory — it used to be a hardcoded teal
 * square, which was the one thing on the console that had not been redesigned.
 */
/**
 * The mark. Teal on every ground, in the step that ground can carry.
 *
 * It used to inherit currentColor, which meant it was whatever the text around
 * it happened to be — white in the navy chrome, ink on the pages — so the one
 * element that is supposed to be constant was the one element that changed on
 * every screen. It is teal now, and the two steps exist only because a single
 * value cannot clear 3:1 against both navy and white.
 *
 * The outline sits at 0.8 rather than full strength so the tick reads as the
 * figure and the shield as its enclosure; below about 0.8 the outline itself
 * drops under 3:1 on navy, which is why it is not fainter.
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
  "mt-1.5 h-[46px] w-full rounded-[10px] border-[1.5px] border-gray-200 bg-white px-3.5 text-[14.5px] text-gray-900 outline-none transition focus:border-teal-600 focus:shadow-[0_0_0_3px_rgba(27,65,121,0.12)]";
export const authLabel = "block text-[13.5px] font-medium text-gray-700";
export const authButton =
  "h-12 w-full rounded-[10px] bg-teal-700 text-[15px] font-medium text-white transition hover:bg-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/40 disabled:opacity-50";
