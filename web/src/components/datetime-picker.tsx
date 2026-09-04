"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A date and time you pick rather than type.
 *
 * The native datetime-local control puts a calendar behind a small icon and
 * makes typing the default, which is the wrong way round for someone setting an
 * exam window. This is a plain month grid plus hour, minute and AM/PM — every
 * part chosen by clicking.
 *
 * It works entirely in wall-clock parts and never constructs a Date from them,
 * so nothing here can be shifted by the browser's own zone. The value it submits
 * is `YYYY-MM-DDTHH:mm`, which the server reads as Philippine time — the one
 * place a zone is applied.
 */

import {
  clampDay,
  daysInMonth,
  firstDow,
  labelParts,
  MONTHS,
  nowInManila,
  parseParts,
  serialiseParts,
  setHour12,
  shiftMonth as shiftMonthParts,
  type Parts,
} from "@/lib/wallclock";

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const pad = (n: number) => String(n).padStart(2, "0");

export function DateTimePicker({
  name,
  defaultValue,
  label: fieldLabel,
  describedBy,
}: {
  name: string;
  defaultValue: string;
  label: string;
  describedBy?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const picked = parseParts(value);
  const today = nowInManila();
  const [view, setView] = useState(() => {
    const p = picked ?? today;
    return { y: p.y, m: p.m };
  });

  // Clicking away or pressing Escape closes it, the way a menu should.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const current = picked ?? { ...today, hh: 8, mm: 0 };

  const setPart = (patch: Partial<Parts>) => {
    // A day that does not exist in the new month (31st of a 30-day month)
    // snaps back rather than rolling into the next one.
    setValue(serialiseParts(clampDay({ ...current, ...patch })));
  };

  const shiftMonth = (by: number) => setView(shiftMonthParts(view, by));

  const cells: (number | null)[] = [
    ...Array<null>(firstDow(view.y, view.m)).fill(null),
    ...Array.from({ length: daysInMonth(view.y, view.m) }, (_, i) => i + 1),
  ];

  const h12 = current.hh % 12 === 0 ? 12 : current.hh % 12;
  const isPm = current.hh >= 12;

  const select =
    "rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100";

  return (
    <div className="relative" ref={box}>
      <input type="hidden" name={name} value={value} />

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby={describedBy}
        className="mt-1 flex w-full items-center justify-between gap-2 rounded-md border border-gray-300 px-3 py-2 text-left text-sm text-gray-900 transition hover:border-gray-400 focus:border-gray-900 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:hover:border-gray-600 dark:focus:border-gray-400"
      >
        <span className={picked ? "" : "text-gray-400 dark:text-gray-500"}>
          {picked ? labelParts(picked) : "Not set"}
        </span>
        <span aria-hidden className="text-gray-400 dark:text-gray-500">
          📅
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={fieldLabel}
          className="absolute left-0 z-20 mt-2 w-[19rem] rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900"
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="rounded px-2 py-1 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              ‹
            </button>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {MONTHS[view.m]} {view.y}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className="rounded px-2 py-1 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              ›
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-0.5 text-center">
            {DOW.map((d) => (
              <span key={d} className="py-1 text-xs text-gray-500 dark:text-gray-400">
                {d}
              </span>
            ))}
            {cells.map((d, i) => {
              if (d === null) return <span key={`x${i}`} />;
              const isPicked =
                picked && picked.y === view.y && picked.m === view.m && picked.d === d;
              const isToday = today.y === view.y && today.m === view.m && today.d === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setPart({ y: view.y, m: view.m, d })}
                  aria-current={isPicked ? "date" : undefined}
                  className={`rounded py-1.5 text-sm transition ${
                    isPicked
                      ? "bg-teal-700 font-medium text-white dark:bg-teal-600"
                      : isToday
                        ? "bg-gray-100 text-gray-900 ring-1 ring-inset ring-gray-300 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600"
                        : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-1.5 border-t border-gray-100 pt-3 dark:border-gray-800">
            <label className="sr-only" htmlFor={`${name}-h`}>
              Hour
            </label>
            <select
              id={`${name}-h`}
              value={h12}
              onChange={(e) => {
                setPart(setHour12(current, Number(e.target.value), isPm));
              }}
              className={select}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <span className="text-gray-500 dark:text-gray-400">:</span>
            <label className="sr-only" htmlFor={`${name}-m`}>
              Minute
            </label>
            <select
              id={`${name}-m`}
              value={current.mm - (current.mm % 5)}
              onChange={(e) => setPart({ mm: Number(e.target.value) })}
              className={select}
            >
              {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                <option key={m} value={m}>
                  {pad(m)}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor={`${name}-ap`}>
              AM or PM
            </label>
            <select
              id={`${name}-ap`}
              value={isPm ? "PM" : "AM"}
              onChange={(e) => {
                setPart(setHour12(current, h12, e.target.value === "PM"));
              }}
              className={select}
            >
              <option>AM</option>
              <option>PM</option>
            </select>

            <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">PH time</span>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-800">
            <button
              type="button"
              onClick={() => {
                setValue("");
                setOpen(false);
              }}
              className="text-sm text-gray-500 underline underline-offset-4 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
