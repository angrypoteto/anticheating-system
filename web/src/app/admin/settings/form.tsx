"use client";

import { useActionState, useState } from "react";
import { saveSettings, type SettingsState } from "./actions";

export type Settings = {
  institution_name: string;
  pass_threshold: number;
  default_total_minutes: number;
  default_per_question_seconds: number | null;
  default_max_strikes: number;
  default_fullscreen: boolean;
  default_block_copy_paste: boolean;
  default_honeypot: boolean;
  allow_student_signup: boolean;
  classes_enabled: boolean;
};

const field =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100";
const label = "block text-sm font-medium text-gray-700 dark:text-gray-300";
const hint = "mt-1 text-xs text-gray-500 dark:text-gray-400";
const check = "flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300";

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettings, {});
  const [perQuestion, setPerQuestion] = useState(settings.default_per_question_seconds != null);

  return (
    <form action={action} className="space-y-8">
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          General
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="institutionName" className={label}>Institution name</label>
            <input
              id="institutionName"
              name="institutionName"
              defaultValue={settings.institution_name}
              className={field}
            />
          </div>
          <div>
            <label htmlFor="passThreshold" className={label}>Pass mark (%)</label>
            <input
              id="passThreshold"
              name="passThreshold"
              type="number"
              min={0}
              max={100}
              defaultValue={Number(settings.pass_threshold)}
              className={field}
            />
            <p className={hint}>
              Decides what counts as failing in the students &amp; risk report.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Defaults for new exams
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Applied when an instructor creates an exam. Existing exams keep their own
          settings.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="defaultTotalMinutes" className={label}>Time limit (minutes)</label>
            <input
              id="defaultTotalMinutes"
              name="defaultTotalMinutes"
              type="number"
              min={0}
              defaultValue={settings.default_total_minutes}
              className={field}
            />
            <p className={hint}>0 means untimed.</p>
          </div>
          <div>
            <label className={check}>
              <input
                type="checkbox"
                name="perQuestionEnabled"
                checked={perQuestion}
                onChange={(e) => setPerQuestion(e.target.checked)}
                className="mt-0.5"
              />
              Per-question limit
            </label>
            <input
              name="defaultPerQuestionSeconds"
              type="number"
              min={5}
              disabled={!perQuestion}
              defaultValue={settings.default_per_question_seconds ?? 60}
              aria-label="Seconds per question"
              className={`${field} disabled:opacity-40`}
            />
            <p className={hint}>Seconds.</p>
          </div>
          <div>
            <label htmlFor="defaultMaxStrikes" className={label}>Strikes before auto-submit</label>
            <input
              id="defaultMaxStrikes"
              name="defaultMaxStrikes"
              type="number"
              min={1}
              defaultValue={settings.default_max_strikes}
              className={field}
            />
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <label className={check}>
            <input type="checkbox" name="defaultFullscreen" defaultChecked={settings.default_fullscreen} className="mt-0.5" />
            Require fullscreen
          </label>
          <label className={check}>
            <input type="checkbox" name="defaultBlockCopyPaste" defaultChecked={settings.default_block_copy_paste} className="mt-0.5" />
            Block copy/paste and right-click
          </label>
          <label className={check}>
            <input type="checkbox" name="defaultHoneypot" defaultChecked={settings.default_honeypot} className="mt-0.5" />
            Include the hidden honeypot field
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Classes
        </h3>
        <label className={check}>
          <input type="checkbox" name="classesEnabled" defaultChecked={settings.classes_enabled} className="mt-0.5" />
          <span>
            Organise exams by class and subject
            <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
              On, a class is one subject for one section with its own join code,
              and an exam only reaches the classes it is set for. Off, all of
              that disappears for teachers and students: an exam simply reaches
              every student, and teachers just publish, watch it live and read
              the results. Nothing is deleted — your classes and enrolments come
              back if you switch it on again.
            </span>
          </span>
        </label>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Registration
        </h3>
        <label className={check}>
          <input type="checkbox" name="allowStudentSignup" defaultChecked={settings.allow_student_signup} className="mt-0.5" />
          <span>
            Let students register themselves with a class code
            <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
              Turn this off and only an administrator can create accounts. Either
              way, self-registration can only ever produce a student.
            </span>
          </span>
        </label>
      </section>

      {state.error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
          {state.success}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-teal-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500"
      >
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
