"use client";

import { useActionState, useMemo, useState } from "react";
import { setExamRoster, type ActionState } from "../actions";

export type RosterPerson = {
  id: string;
  name: string;
  sat: boolean;
  onRoster: boolean;
};

/**
 * Who this exam is for.
 *
 * Without a roster the only students the system knows about are the ones who
 * already opened the link, so a teacher can never see who is missing — which is
 * the single most useful thing to know during an exam.
 */
export function Roster({
  examId,
  people,
  linkOnly,
}: {
  examId: string;
  people: RosterPerson[];
  /** Classes are off, so this list is the whole roster rather than an addition. */
  linkOnly: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setExamRoster, {});
  const [q, setQ] = useState("");

  const { on, off } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (p: RosterPerson) => !needle || p.name.toLowerCase().includes(needle);
    return {
      on: people.filter((p) => p.onRoster && match(p)),
      off: people.filter((p) => !p.onRoster && match(p)),
    };
  }, [people, q]);

  const assigned = people.filter((p) => p.onRoster);
  const missing = assigned.filter((p) => !p.sat);

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-50">Who it is for</h2>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {assigned.length} assigned
          {assigned.length ? ` · ${missing.length} yet to sit it` : ""}
        </span>
      </div>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        {linkOnly
          ? "Anyone you add here can sit it, and shows as missing until they do. Opening the share link adds a student automatically — assign them here first if you want to know who has not turned up."
          : "Anyone here can sit it on top of the classes it is set for. Opening the share link adds a student automatically."}
      </p>

      <label htmlFor="roster-search" className="sr-only">
        Search students
      </label>
      <input
        id="roster-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search students…"
        className="mt-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-gray-400"
      />

      {state.error ? (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}

      {on.length ? (
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {on.map((p) => (
            <li key={p.id}>
              <form action={action} className="inline">
                <input type="hidden" name="examId" value={examId} />
                <input type="hidden" name="studentId" value={p.id} />
                <input type="hidden" name="add" value="0" />
                <button
                  type="submit"
                  disabled={pending}
                  title={p.sat ? "Has sat it — remove from the roster" : "Remove from the roster"}
                  className={`rounded-full border px-2.5 py-1 text-xs transition disabled:opacity-50 ${
                    p.sat
                      ? "border-green-300 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/60 dark:text-green-300"
                      : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300"
                  }`}
                >
                  {p.sat ? "✓ " : "· "}
                  {p.name} ×
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Nobody assigned yet.
        </p>
      )}

      {off.length ? (
        <details className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
          <summary className="cursor-pointer text-sm text-gray-600 dark:text-gray-400">
            Add students ({off.length} not on the roster)
          </summary>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {off.slice(0, 60).map((p) => (
              <li key={p.id}>
                <form action={action} className="inline">
                  <input type="hidden" name="examId" value={examId} />
                  <input type="hidden" name="studentId" value={p.id} />
                  <input type="hidden" name="add" value="1" />
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-600 transition hover:border-gray-400 hover:text-gray-900 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:text-gray-100"
                  >
                    + {p.name}
                  </button>
                </form>
              </li>
            ))}
          </ul>
          {off.length > 60 ? (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Showing 60 — search to narrow it down.
            </p>
          ) : null}
        </details>
      ) : null}
    </section>
  );
}
