"use client";

import { useActionState } from "react";
import { setExamWindow } from "../actions";
import type { ActionState } from "../actions";

/** The value a datetime-local input wants, from an ISO string, in Manila time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  // en-CA gives YYYY-MM-DD; the time part is forced to 24-hour.
  const date = d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const time = d.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date}T${time}`;
}

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
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p role="status" className="text-sm text-green-700 dark:text-green-400">
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
    good: "bg-green-50 text-green-800 ring-green-200 dark:bg-green-950/60 dark:text-green-300 dark:ring-green-900",
    warn: "bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-900",
    bad: "bg-red-50 text-red-800 ring-red-200 dark:bg-red-950/60 dark:text-red-300 dark:ring-red-900",
    muted: "bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700",
  }[status.tone];

  const field =
    "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-gray-400";
  const label = "block text-sm font-medium text-gray-700 dark:text-gray-300";

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-50">Availability</h2>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${tone}`}>
          {status.label}
        </span>
      </div>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{status.note}</p>

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
                ? "bg-red-700 hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500"
                : "bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
            }`}
          >
            {pending ? "…" : isOpen ? "Close now" : "Open now"}
          </button>
        </form>
      </div>

      <form action={action} className="mt-6 space-y-4 border-t border-gray-100 pt-4 dark:border-gray-800">
        <input type="hidden" name="examId" value={examId} />
        <input type="hidden" name="mode" value="schedule" />

        <p className="text-sm text-gray-600 dark:text-gray-400">
          Or set the window in advance. Times are Philippine time; leave either
          side blank to leave it unbounded.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="opensAt" className={label}>
              Opens
            </label>
            <input
              id="opensAt"
              name="opensAt"
              type="datetime-local"
              defaultValue={toLocalInput(opensAt)}
              className={field}
            />
          </div>
          <div>
            <label htmlFor="closesAt" className={label}>
              Closes
            </label>
            <input
              id="closesAt"
              name="closesAt"
              type="datetime-local"
              defaultValue={toLocalInput(closesAt)}
              className={field}
            />
          </div>
        </div>

        <Feedback state={state} />

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
        >
          {pending ? "Saving…" : "Save schedule"}
        </button>
      </form>
    </section>
  );
}
