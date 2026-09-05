"use client";

import { useActionState } from "react";
import { setExamWindow } from "../actions";
import { DateTimePicker } from "@/components/datetime-picker";
import { isoToInput } from "@/lib/wallclock";
import type { ActionState } from "../actions";

const shown = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Manila",
      })
    : null;

function Feedback({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
        {state.success}
      </p>
    );
  }
  return null;
}

/**
 * Opening, closing and scheduling — one control, because they are one thing.
 * "Close now" is a closing time of this instant, so a manual override cannot
 * end up contradicting a schedule.
 */
export function ExamWindow({
  examId,
  opensAt,
  closesAt,
  isOpen,
  published,
}: {
  examId: string;
  opensAt: string | null;
  closesAt: string | null;
  isOpen: boolean;
  published: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    setExamWindow,
    {},
  );

  const now = Date.now();
  const notYet = opensAt && new Date(opensAt).getTime() > now;
  const over = closesAt && new Date(closesAt).getTime() <= now;

  const status = !published
    ? { label: "Draft", tone: "muted", note: "Publish it before any of this applies." }
    : over
      ? { label: "Closed", tone: "bad", note: `Closed ${shown(closesAt)}. Nobody can start or submit.` }
      : notYet
        ? { label: "Scheduled", tone: "warn", note: `Opens ${shown(opensAt)}.` }
        : {
            label: "Open",
            tone: "good",
            note: closesAt ? `Closes ${shown(closesAt)}.` : "Open until you close it.",
          };

  const tone = {
    good: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900",
    warn: "bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-900",
    bad: "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-900",
    muted: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
  }[status.tone];

  const label = "block text-sm font-medium text-slate-700 dark:text-slate-300";

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium text-slate-900 dark:text-slate-50">Availability</h2>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${tone}`}>
          {status.label}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{status.note}</p>

      {/* Open and close by hand. Both are just the window, set to now. */}
      <div className="mt-4 flex flex-wrap gap-2">
        <form action={action}>
          <input type="hidden" name="examId" value={examId} />
          <input type="hidden" name="mode" value={isOpen ? "close" : "open"} />
          <button
            type="submit"
            disabled={pending || !published}
            className={`rounded-md px-3 py-2 text-sm font-medium text-white transition disabled:opacity-50 ${
              isOpen
                ? "bg-rose-700 hover:bg-rose-800 dark:bg-rose-600 dark:hover:bg-rose-500"
                : "bg-indigo-700 hover:bg-indigo-800 dark:bg-indigo-600 dark:hover:bg-indigo-500"
            }`}
          >
            {pending ? "…" : isOpen ? "Close now" : "Open now"}
          </button>
        </form>
      </div>

      <form action={action} className="mt-6 space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800">
        <input type="hidden" name="examId" value={examId} />
        <input type="hidden" name="mode" value="schedule" />

        <p className="text-sm text-slate-600 dark:text-slate-400">
          Or set the window in advance. Pick a date and time from the calendar —
          leave either side unset to leave it unbounded.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className={label}>Opens</span>
            <DateTimePicker
              name="opensAt"
              label="When the exam opens"
              defaultValue={isoToInput(opensAt)}
            />
          </div>
          <div>
            <span className={label}>Closes</span>
            <DateTimePicker
              name="closesAt"
              label="When the exam closes"
              defaultValue={isoToInput(closesAt)}
            />
          </div>
        </div>

        <Feedback state={state} />

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          {pending ? "Saving…" : "Save schedule"}
        </button>
      </form>
    </section>
  );
}
