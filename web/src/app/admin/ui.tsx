/** Shared pieces so every console screen looks like the same product. */

export function PageHeader({
  title,
  subtitle,
  action,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-indigo-200/70 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
            <span className="h-1 w-1 rounded-full bg-indigo-500" />
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-[26px] font-semibold tracking-tight text-slate-900 dark:text-white">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  );
}

export function Card({
  title,
  hint,
  children,
  flush,
  action,
}: {
  title?: string;
  hint?: string;
  children: React.ReactNode;
  /** Let the content run to the card edge — for tables and lists. */
  flush?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <section className="card-elev overflow-hidden rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900">
      {title ? (
        <div
          className={`flex items-start justify-between gap-4 ${flush ? "border-b border-slate-100 dark:border-slate-800" : ""} px-6 pt-5 ${flush ? "pb-4" : "pb-3"}`}
        >
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
              {title}
            </h2>
            {hint ? (
              <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                {hint}
              </p>
            ) : null}
          </div>
          {action}
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
  const toneDot = {
    plain: "bg-indigo-500",
    good: "bg-emerald-500",
    warn: "bg-amber-500",
    bad: "bg-rose-500",
  }[tone];
  const toneValue = {
    plain: "text-slate-900 dark:text-white",
    good: "text-emerald-700 dark:text-emerald-300",
    warn: "text-amber-700 dark:text-amber-300",
    bad: "text-rose-700 dark:text-rose-300",
  }[tone];

  return (
    <div className="card-elev group rounded-2xl border border-slate-200/80 bg-white p-5 transition hover:-translate-y-px hover:shadow-[0_12px_28px_-12px_rgb(15_23_42/0.18)] dark:border-slate-800 dark:bg-slate-900">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <span className={`h-1.5 w-1.5 rounded-full ${toneDot}`} />
        {label}
      </p>
      <p className={`mt-2 text-[28px] font-semibold tabular-nums tracking-tight ${toneValue}`}>
        {value}
      </p>
      {note ? (
        <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{note}</p>
      ) : null}
    </div>
  );
}

export function Pill({
  tone,
  children,
}: {
  tone: "good" | "warn" | "bad" | "muted" | "brand";
  children: React.ReactNode;
}) {
  const cls = {
    good: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
    warn: "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
    bad: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20",
    muted:
      "bg-slate-100 text-slate-600 ring-slate-600/10 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-400/10",
    brand:
      "bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20",
  }[tone];
  const dot = {
    good: "bg-emerald-500",
    warn: "bg-amber-500",
    bad: "bg-rose-500",
    muted: "bg-slate-400",
    brand: "bg-indigo-500",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
          <path
            d="M10 2.5A7.5 7.5 0 1 0 17.5 10M17.5 2.5v5h-5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        {children}
      </p>
    </div>
  );
}
