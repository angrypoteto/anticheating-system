"use client";

import { classLabel } from "@/lib/classes";
import { SubjectPicker, type SubjectOption } from "@/components/subject-picker";

import { useActionState } from "react";
import { createExam, type ActionState } from "./actions";

const field =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-400";
const label = "block text-sm font-medium text-slate-700 dark:text-slate-300";
const button =
  "rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300";

export function CreateExamForm({
  sections,
  classless,
  subjects,
}: {
  sections: { id: string; name: string; subject?: string | null }[];
  /** Classes are switched off system-wide: publish to everyone, ask nothing. */
  classless?: boolean;
  subjects: SubjectOption[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createExam,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="title" className={label}>
            Exam title
          </label>
          <input
            id="title"
            name="title"
            placeholder="Midterm Exam"
            required
            className={field}
          />
        </div>
        <SubjectPicker subjects={subjects} />

        {classless ? null : (
          <div>
            <label htmlFor="sectionId" className={label}>
              Class
            </label>
            <select id="sectionId" name="sectionId" required defaultValue="" className={field}>
              <option value="" disabled>
                {sections.length ? "— pick one —" : "— no classes assigned —"}
              </option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {classLabel(s)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {state.error}
        </p>
      ) : null}

      {classless ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Classes are off, so this reaches whoever you send the link to — you
          get the link once it is published.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || (!classless && sections.length === 0)}
        className={button}
      >
        {pending ? "Creating…" : "Create exam"}
      </button>
    </form>
  );
}
