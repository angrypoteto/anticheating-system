import Link from "next/link";

/**
 * The pieces every console screen is built from.
 *
 * These carry the Instrument proportions, which is most of what makes a set of
 * screens read as one product: 12px on a panel and 8px on the controls inside
 * it, a 20px gutter, one hairline weight around a panel and a lighter one
 * inside it, labels in sentence case, and a figure large enough to be read
 * before the label that names it.
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
    <header className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-gray-900">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 max-w-[62ch] text-sm text-gray-500">{subtitle}</p>
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
        <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
            {hint ? (
              <p className="mt-0.5 max-w-[64ch] text-[12.5px] text-gray-500">{hint}</p>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}

/**
 * A row of figures, as one strip rather than four cards.
 *
 * Four bordered boxes side by side read as four separate things to look at;
 * one panel divided by rules reads as one reading of the same moment, which is
 * what they are.
 */
export function Stats({ children }: { children: React.ReactNode }) {
  return (
    // The rules are the 1px gaps letting the grey behind show through, so they
    // land in the right places at one, two or four across without a rule per cell.
    <div className="grid gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-100 sm:grid-cols-2 lg:grid-cols-4 [&>*]:rounded-none! [&>*]:border-0!">
      {children}
    </div>
  );
}

/**
 * A figure, its name, and what it is a figure *of*.
 *
 * The qualifier underneath is not decoration: "78%" and "78% of those who
 * submitted" are different claims, and a teacher acts on the second. On its own
 * it is a small panel; inside <Stats> it becomes one cell of the strip.
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
    warn: "text-amber-800",
    bad: "text-red-700",
  }[tone];

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-5.5 py-4.5">
      <p className="text-[13px] font-medium text-gray-500">{label}</p>
      <p
        className={`mt-2 text-[32px] leading-none font-semibold tracking-[-0.02em] tabular-nums ${toneClass}`}
      >
        {value}
      </p>
      {note ? <p className="mt-1.5 text-[12.5px] text-gray-400">{note}</p> : null}
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
    good: "bg-green-50 text-green-800",
    warn: "bg-amber-50 text-amber-800",
    bad: "bg-red-50 text-red-800",
    muted: "bg-gray-100 text-gray-600",
    brand: "bg-gray-100 text-gray-900",
  }[tone];

  return (
    <span
      className={`inline-flex h-5.5 items-center gap-1.5 rounded-full px-2 text-[12.5px] font-semibold whitespace-nowrap ${cls}`}
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
      className="shrink-0 text-[13.5px] font-medium text-gray-900 underline decoration-gray-300 underline-offset-[3px] hover:decoration-gray-900"
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
      className="inline-flex h-[38px] shrink-0 items-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-700"
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
    <div className="flex items-center gap-4 border-b border-gray-100 px-5 py-3 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-gray-900">{title}</span>
        {detail ? (
          <span className="mt-0.5 block text-[12.5px] text-gray-500">{detail}</span>
        ) : null}
      </span>
      {children}
    </div>
  );
}

/** The date on the right of a list row. Tabular so dates line up down the column. */
export function RowWhen({ children }: { children: React.ReactNode }) {
  return <span className="shrink-0 text-[13px] tabular-nums text-gray-500">{children}</span>;
}

/**
 * A named fact and its reading — "Last backup / Today, 3:00 AM".
 *
 * Distinct from ListRow on purpose: a fact has no second line and no state
 * pill, so it gets a tighter row. Two shapes, two meanings.
 */
export function FactRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-gray-100 px-5 py-2 text-[13.5px] text-gray-900 last:border-b-0">
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

/** The label above a subject or class. Sentence case: it names, it does not shout. */
export function SubjectLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[12.5px] font-medium text-accent">{children}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-5 text-sm text-gray-500">{children}</p>;
}
