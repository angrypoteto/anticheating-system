"use client";

import { useState } from "react";

/**
 * Palette: categorical slots 1-3, validated with the dataviz validator against
 * this app's own card surfaces (#ffffff light, #111827 dark) rather than the
 * reference ones — all checks pass in both modes. Light-mode aqua sits at 2.82:1,
 * which obliges relief, so every segment is direct-labelled and a table view is
 * one click away. Dark steps are chosen for the dark surface, not flipped.
 */
const SERIES = {
  done: { light: "#2a78d6", dark: "#3987e5", label: "Completed" },
  taking: { light: "#eb6834", dark: "#d95926", label: "Sitting now" },
  notStarted: { light: "#1baf7a", dark: "#199e70", label: "Not started" },
} as const;

type Key = keyof typeof SERIES;
const ORDER: Key[] = ["done", "taking", "notStarted"];

export type ClassRow = {
  name: string;
  done: number;
  taking: number;
  notStarted: number;
};

export type InstructorRow = { name: string; published: number; drafts: number };

function Swatch({ k }: { k: Key }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]"
      style={{ background: `var(--s-${k})` }}
    />
  );
}

/** Part-to-whole per class: horizontal stacked bar, one row per class. */
export function ClassProgressChart({ rows }: { rows: ClassRow[] }) {
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<{ cls: string; k: Key } | null>(null);

  const totals = rows.map((r) => r.done + r.taking + r.notStarted);
  const max = Math.max(1, ...totals);

  return (
    <div
      style={
        {
          "--s-done": SERIES.done.light,
          "--s-taking": SERIES.taking.light,
          "--s-notStarted": SERIES.notStarted.light,
        } as React.CSSProperties
      }
      className="[&_*]:dark:[--s-done:#3987e5] [&_*]:dark:[--s-taking:#d95926] [&_*]:dark:[--s-notStarted:#199e70] dark:[--s-done:#3987e5] dark:[--s-taking:#d95926] dark:[--s-notStarted:#199e70]"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* Legend is always present for >= 2 series. */}
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {ORDER.map((k) => (
            <li
              key={k}
              className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400"
            >
              <Swatch k={k} />
              {SERIES[k].label}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setTable((t) => !t)}
          className="text-xs text-slate-500 underline underline-offset-4 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          {table ? "Show chart" : "Show numbers"}
        </button>
      </div>

      {table ? (
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-2 font-medium">Class</th>
              {ORDER.map((k) => (
                <th key={k} className="py-2 font-medium">{SERIES[k].label}</th>
              ))}
              <th className="py-2 font-medium">Students</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-2 text-slate-900 dark:text-slate-100">{r.name}</td>
                {ORDER.map((k) => (
                  <td key={k} className="py-2 text-slate-700 dark:text-slate-300">{r[k]}</td>
                ))}
                <td className="py-2 text-slate-700 dark:text-slate-300">{totals[i]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="space-y-4">
          {rows.map((r, i) => {
            const total = totals[i];
            return (
              <li key={r.name}>
                <div className="mb-1.5 flex items-baseline justify-between text-sm">
                  <span className="text-slate-900 dark:text-slate-100">{r.name}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {total} student{total === 1 ? "" : "s"}
                  </span>
                </div>

                {/* Track width is shared across rows so classes stay comparable. */}
                <div className="flex h-7 w-full gap-[2px]" style={{ maxWidth: `${(total / max) * 100}%` }}>
                  {ORDER.map((k) => {
                    const v = r[k];
                    if (!v) return null;
                    const pct = (v / total) * 100;
                    const isHovered = hover?.cls === r.name && hover.k === k;
                    return (
                      <div
                        key={k}
                        onMouseEnter={() => setHover({ cls: r.name, k })}
                        onMouseLeave={() => setHover(null)}
                        title={`${r.name} — ${SERIES[k].label}: ${v}`}
                        className="relative flex items-center justify-center rounded-[4px] transition-opacity first:rounded-l-[4px] last:rounded-r-[4px]"
                        style={{
                          width: `${pct}%`,
                          background: `var(--s-${k})`,
                          opacity: hover && !isHovered ? 0.55 : 1,
                        }}
                      >
                        {/* Direct label — the relief the contrast warning requires. */}
                        {pct > 12 ? (
                          <span className="text-xs font-medium text-white">{v}</span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {/* Values in ink, never in the series colour. */}
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  {ORDER.filter((k) => r[k] > 0)
                    .map((k) => `${r[k]} ${SERIES[k].label.toLowerCase()}`)
                    .join(" · ") || "no students yet"}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Magnitude for one series: sequential single hue, no legend needed. */
export function ExamsByInstructorChart({ rows }: { rows: InstructorRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.published + r.drafts));

  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const total = r.published + r.drafts;
        return (
          <li key={r.name}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="truncate text-slate-900 dark:text-slate-100">{r.name}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {r.published} published{r.drafts ? ` · ${r.drafts} draft` : ""}
              </span>
            </div>
            <div className="flex h-5 gap-[2px]" style={{ width: `${(total / max) * 100}%` }}>
              {r.published > 0 ? (
                <div
                  title={`${r.name}: ${r.published} published`}
                  className="rounded-[4px] bg-[#2a78d6] dark:bg-[#3987e5]"
                  style={{ width: `${(r.published / total) * 100}%` }}
                />
              ) : null}
              {r.drafts > 0 ? (
                <div
                  title={`${r.name}: ${r.drafts} draft`}
                  className="rounded-[4px] bg-[#9ec5f4] dark:bg-[#256abf]"
                  style={{ width: `${(r.drafts / total) * 100}%` }}
                />
              ) : null}
            </div>
          </li>
        );
      })}
      {rows.length === 0 ? (
        <li className="text-sm text-slate-500 dark:text-slate-400">
          No instructor has created an exam yet.
        </li>
      ) : null}
    </ul>
  );
}
