import Link from "next/link";

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

/**
 * A card's header link — "All exams & quizzes", "Manage", "Details".
 *
 * Every list card on the console ends somewhere fuller, and the way back is
 * always in the same corner. It is a link and looks like one: the card already
 * has one job, and a second button in its header would make you decide which.
 */
export function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="shrink-0 text-sm text-teal-700 hover:text-teal-800 hover:underline hover:underline-offset-[3px]"
    >
      {children}
    </Link>
  );
}

/** The one primary action on a screen, in the page header. */
export function PrimaryAction({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-[42px] shrink-0 items-center gap-2.25 rounded-[9px] bg-teal-700 px-4.5 text-sm font-medium text-white hover:bg-teal-800"
    >
      {children}
    </Link>
  );
}

/**
 * A row in a list card: what the row *is*, what it is about, then its state.
 *
 * The two lines are one block on the left because they name the same thing —
 * proximity does the grouping, so no rule or indent has to. Everything on the
 * right is state, never an action, which is what lets the eye run down the
 * right-hand edge of a list and read only the states.
 */
export function ListRow({
  title,
  detail,
  children,
}: {
  title: React.ReactNode;
  detail?: React.ReactNode;
  /** State on the right — a pill, a date, both. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-gray-100 px-5.5 py-3.5 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-medium text-gray-900">{title}</span>
        {detail ? (
          <span className="mt-[3px] block text-[12.5px] text-gray-500">{detail}</span>
        ) : null}
      </span>
      {children}
    </div>
  );
}

/** The date on the right of a list row. Mono so dates line up down the column. */
export function RowWhen({ children }: { children: React.ReactNode }) {
  return <span className="shrink-0 font-mono text-xs text-gray-500">{children}</span>;
}

/**
 * A named fact and its reading — "Last backup / Today, 3:00 AM".
 *
 * Distinct from ListRow on purpose: a fact has no second line and no state
 * pill, so it gets a tighter row. Two shapes, two meanings.
 */
export function FactRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5.5 py-[13px] text-sm text-gray-900 last:border-b-0">
      <span>{label}</span>
      {children}
    </div>
  );
}

/** A fact's reading when it is just a value, not a state. */
export function FactValue({ children }: { children: React.ReactNode }) {
  return <span className="text-[13px] text-gray-500">{children}</span>;
}

/**
 * A reachable dependency. The dot is filled because the thing is live right
 * now — an outline would read as "configured", which is a different claim.
 */
export function Reachable({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.75 text-[13px] font-medium ${
        ok ? "text-green-700" : "text-red-700"
      }`}
    >
      <span aria-hidden className="h-2 w-2 rounded-full bg-current" />
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
