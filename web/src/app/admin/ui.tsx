/** Small shared pieces so every admin screen looks like the same product. */

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
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 pb-5 dark:border-gray-800">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">{title}</h1>
        {subtitle ? (
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}

export function Card({
  title,
  hint,
  children,
  flush,
}: {
  title?: string;
  hint?: string;
  children: React.ReactNode;
  /** Let the content run to the card edge — for tables and lists. */
  flush?: boolean;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      {title ? (
        <div className={`${flush ? "border-b border-gray-200 dark:border-gray-800" : ""} p-6 ${flush ? "" : "pb-4"}`}>
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-50">{title}</h2>
          {hint ? (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{hint}</p>
          ) : null}
        </div>
      ) : null}
      <div className={flush ? "" : title ? "px-6 pb-6" : "p-6"}>{children}</div>
    </section>
  );
}

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
    plain: "text-gray-900 dark:text-gray-50",
    good: "text-green-700 dark:text-green-400",
    warn: "text-amber-700 dark:text-amber-400",
    bad: "text-red-700 dark:text-red-400",
  }[tone];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
      {note ? <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{note}</p> : null}
    </div>
  );
}

export function Pill({
  tone,
  children,
}: {
  tone: "good" | "warn" | "bad" | "muted";
  children: React.ReactNode;
}) {
  const cls = {
    good: "bg-green-50 text-green-800 dark:bg-green-950/60 dark:text-green-300",
    warn: "bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300",
    bad: "bg-red-50 text-red-800 dark:bg-red-950/60 dark:text-red-300",
    muted: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  }[tone];
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-6 text-sm text-gray-500 dark:text-gray-400">{children}</p>;
}
