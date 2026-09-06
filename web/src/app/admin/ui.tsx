/**
 * The pieces every console screen is built from.
 *
 * These carry the design's proportions, which is most of what makes a set of
 * screens read as one product: 12px on a card and 8px on the controls inside
 * it, a 22px gutter, a label that is small and spaced rather than merely grey,
 * and a figure large enough to be read before the label that names it.
 */

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-6 border-b border-gray-200 pb-5.5">
      <div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-gray-900">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1.5 max-w-[62ch] text-sm text-gray-500">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}

export function Card({
  title,
  hint,
  action,
  children,
  flush,
}: {
  title?: string;
  hint?: string;
  /** A link on the header's right — "All exams", "Manage", "Details". */
  action?: React.ReactNode;
  children: React.ReactNode;
  /** Let the content run to the card edge — for tables and lists. */
  flush?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      {title ? (
        <div
          className={`flex items-baseline justify-between gap-4 px-5.5 ${
            flush ? "border-b border-gray-100 py-4.5" : "pt-4.5 pb-3"
          }`}
        >
          <div>
            <h2 className="text-base font-semibold tracking-tight text-gray-900">{title}</h2>
            {hint ? <p className="mt-1 max-w-[64ch] text-sm text-gray-500">{hint}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={flush ? "" : title ? "px-5.5 pb-5.5" : "p-5.5"}>{children}</div>
    </section>
  );
}

/**
 * A figure, its name, and what it is a figure *of*.
 *
 * The qualifier underneath is not decoration: "78%" and "78% of those who
 * submitted" are different claims, and a teacher acts on the second.
 */
export function Stat({
  label,
  value,
  tone = "plain",
  note,
}: {
  label: string;
  value: string;
  tone?: "plain" | "good" | "warn" | "bad";
  note?: string;
}) {
  const toneClass = {
    plain: "text-gray-900",
    good: "text-green-700",
    warn: "text-amber-700",
    bad: "text-red-700",
  }[tone];

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-5 py-4.5">
      <p className="text-[11px] font-medium tracking-[0.07em] text-gray-500 uppercase">
        {label}
      </p>
      <p className={`mt-2 text-3xl font-semibold tracking-tight tabular-nums ${toneClass}`}>
        {value}
      </p>
      {note ? <p className="mt-1 text-xs text-gray-500">{note}</p> : null}
    </div>
  );
}

/**
 * A pill reports a state the system is in. It is never a button, and nothing
 * that is a button ever wears one — that separation is what lets a teacher read
 * a row without stopping to work out which parts of it are clickable.
 *
 * Every pill carries a word as well as a colour, so it survives a colour-blind
 * reader and a grayscale print-out.
 */
export function Pill({
  tone,
  dot,
  children,
}: {
  tone: "good" | "warn" | "bad" | "muted" | "brand";
  /** A filled dot for a live state — open, active, connected. */
  dot?: boolean;
  children: React.ReactNode;
}) {
  const cls = {
    good: "border-green-200 bg-green-50 text-green-800",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    bad: "border-red-200 bg-red-50 text-red-800",
    muted: "border-gray-200 bg-gray-100 text-gray-600",
    brand: "border-teal-100 bg-teal-50 text-teal-800",
  }[tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${cls}`}
    >
      {dot ? (
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      ) : null}
      {children}
    </span>
  );
}

/** The label above a subject or class — the one place the accent is used. */
export function SubjectLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium tracking-[0.07em] text-accent uppercase">
      {children}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-5.5 text-sm text-gray-500">{children}</p>;
}
