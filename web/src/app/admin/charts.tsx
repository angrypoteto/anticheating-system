"use client";

import { useState } from "react";

/**
 * Palette: one ink ramp, dark to light, because the three states are an order
 * (finished, under way, not begun) rather than three unrelated identities — and
 * under Instrument, hue is kept for status alone. The lightest step is 1.4:1
 * against the white card, which obliges relief: every segment carries its
 * number, the legend is always present, and a table view is one click away.
 * Each step names the ink its label is written in. The dark values are kept
 * for when a dark theme exists; nothing sets it today.
 */
const SERIES = {
  done: { light: "#0E1116", dark: "#E7E7E4", ink: "#FFFFFF", label: "Finished" },
  taking: { light: "#6B7079", dark: "#8A8E94", ink: "#FFFFFF", label: "Sitting now" },
  notStarted: { light: "#D4D5D1", dark: "#3B3F45", ink: "#3B3F45", label: "Not started" },
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
      className="dark:[--s-done:#E7E7E4] dark:[--s-notStarted:#3B3F45] dark:[--s-taking:#8A8E94]"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* Legend is always present for >= 2 series. */}
        <ul className="flex flex-wrap gap-x-4.5 gap-y-1">
          {ORDER.map((k) => (
            <li
              key={k}
              className="flex items-center gap-1.5 text-[12.5px] text-gray-500 dark:text-gray-400"
            >
              <Swatch k={k} />
              {SERIES[k].label}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setTable((t) => !t)}
          className="text-[13px] font-medium text-gray-900 underline decoration-gray-300 underline-offset-[3px] hover:decoration-gray-900 dark:text-gray-100"
        >
          {table ? "Show chart" : "Show numbers"}
        </button>
      </div>

      {table ? (
        <table className="w-full text-left text-sm">
          <thead className="text-[12.5px] text-gray-400">
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
              <tr key={r.name} className="border-t border-gray-100 dark:border-gray-800">
                <td className="py-2 text-gray-900 dark:text-gray-100">{r.name}</td>
                {ORDER.map((k) => (
                  <td key={k} className="py-2 text-gray-700 dark:text-gray-300">{r[k]}</td>
                ))}
                <td className="py-2 text-gray-700 dark:text-gray-300">{totals[i]}</td>
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
                <div className="mb-1.5 flex items-baseline justify-between text-[13.5px]">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{r.name}</span>
                  <span className="text-[12.5px] tabular-nums text-gray-400">
                    {total} student{total === 1 ? "" : "s"}
                  </span>
                </div>

                {/* Track width is shared across rows so classes stay comparable. */}
                <div className="flex h-6 w-full gap-[2px]" style={{ maxWidth: `${(total / max) * 100}%` }}>
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
                        title={`${r.name}, ${SERIES[k].label.toLowerCase()}: ${v}`}
                        className="relative flex items-center justify-center rounded-[4px] transition-opacity first:rounded-l-[4px] last:rounded-r-[4px]"
                        style={{
                          width: `${pct}%`,
                          background: `var(--s-${k})`,
                          opacity: hover && !isHovered ? 0.55 : 1,
                        }}
                      >
                        {/* Direct label — the relief the contrast warning requires. */}
                        {pct > 6 ? (
                          <span
                            className="text-xs font-semibold tabular-nums"
                            style={{ color: SERIES[k].ink }}
                          >
                            {v}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {total === 0 ? (
                  <p className="mt-1.5 text-[12.5px] text-gray-400">No students yet</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Published and draft, per instructor: the same ink ramp's two ends, so the
 * finished work reads as the solid part of the bar and the drafts as its tail.
 */
export function ExamsByInstructorChart({ rows }: { rows: InstructorRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.published + r.drafts));

  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">No instructor has created an exam yet.</p>;
  }

  return (
    <div>
      <ul className="mb-4 flex flex-wrap gap-x-4.5 gap-y-1 text-[12.5px] text-gray-500">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-gray-900" />
          Published
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-gray-300" />
          Draft
        </li>
      </ul>
      <ul className="space-y-3.5">
        {rows.map((r) => {
          const total = r.published + r.drafts;
          return (
            <li key={r.name}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13.5px]">
                <span className="truncate font-medium text-gray-900">{r.name}</span>
                <span className="shrink-0 text-[12.5px] tabular-nums text-gray-400">
                  {r.published} published{r.drafts ? `, ${r.drafts} draft` : ""}
                </span>
              </div>
              <div className="flex h-6 gap-[2px]" style={{ width: `${(total / max) * 100}%` }}>
                {r.published > 0 ? (
                  <div
                    title={`${r.name}: ${r.published} published`}
                    className="flex items-center justify-center rounded-[4px] bg-gray-900 text-xs font-semibold tabular-nums text-white"
                    style={{ width: `${(r.published / total) * 100}%` }}
                  >
                    {r.published}
                  </div>
                ) : null}
                {r.drafts > 0 ? (
                  <div
                    title={`${r.name}: ${r.drafts} draft`}
                    className="flex items-center justify-center rounded-[4px] bg-gray-300 text-xs font-semibold tabular-nums text-gray-700"
                    style={{ width: `${(r.drafts / total) * 100}%` }}
                  >
                    {r.drafts}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
