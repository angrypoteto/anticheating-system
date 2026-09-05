"use client";

import { SubjectPicker, type SubjectOption } from "@/components/subject-picker";

import { useActionState, useState } from "react";
import {
  deleteQuestion,
  saveQuestion,
  setExamStatus,
  updateExamSettings,
  type ActionState,
} from "../actions";
import type { LockdownConfig, TimerConfig } from "@/lib/exam-config";

const field =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-400";
const label = "block text-sm font-medium text-slate-700 dark:text-slate-300";
const button =
  "rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300";
const checkbox = "flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300";

function Feedback({ state }: { state: ActionState }) {
  if (state.error)
    return (
      <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
        {state.error}
      </p>
    );
  if (state.success)
    return (
      <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
        {state.success}
      </p>
    );
  return null;
}

export function SettingsForm({
  examId,
  title,
  timer,
  lockdown,
  subjects,
  subjectId,
}: {
  examId: string;
  title: string;
  timer: TimerConfig;
  lockdown: LockdownConfig;
  subjects: SubjectOption[];
  subjectId: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateExamSettings,
    {},
  );
  const [perQuestion, setPerQuestion] = useState(timer.perQuestionSeconds != null);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="examId" value={examId} />

      <SubjectPicker subjects={subjects} defaultId={subjectId} />

      <div>
        <label htmlFor="title" className={label}>
          Title
        </label>
        <input id="title" name="title" defaultValue={title} required className={field} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="totalMinutes" className={label}>
            Total time (minutes, 0 = untimed)
          </label>
          <input
            id="totalMinutes"
            name="totalMinutes"
            type="number"
            min={0}
            defaultValue={timer.totalMinutes}
            className={field}
          />
        </div>
        <div>
          <label className={checkbox}>
            <input
              type="checkbox"
              name="perQuestionEnabled"
              checked={perQuestion}
              onChange={(e) => setPerQuestion(e.target.checked)}
            />
            Per-question limit
          </label>
          <input
            name="perQuestionSeconds"
            type="number"
            min={1}
            disabled={!perQuestion}
            defaultValue={timer.perQuestionSeconds ?? 60}
            className={`${field} disabled:opacity-40`}
            aria-label="Seconds per question"
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className={label}>Lockdown</legend>
        <label className={checkbox}>
          <input
            type="checkbox"
            name="fullscreenRequired"
            defaultChecked={lockdown.fullscreenRequired}
          />
          Require fullscreen
        </label>
        <label className={checkbox}>
          <input
            type="checkbox"
            name="blockCopyPaste"
            defaultChecked={lockdown.blockCopyPaste}
          />
          Block copy/paste and right-click
        </label>
        <label className={checkbox}>
          <input type="checkbox" name="honeypot" defaultChecked={lockdown.honeypot} />
          Include hidden honeypot field
        </label>
        <div className="pt-1">
          <label htmlFor="maxStrikes" className={label}>
            Strikes before auto-submit
          </label>
          <input
            id="maxStrikes"
            name="maxStrikes"
            type="number"
            min={1}
            defaultValue={lockdown.maxStrikes}
            className={`${field} max-w-[8rem]`}
          />
        </div>
      </fieldset>

      <Feedback state={state} />

      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}

export function UnusedStatusControls({
  examId,
  status,
}: {
  examId: string;
  status: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    setExamStatus,
    {},
  );
  const next = status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";

  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="examId" value={examId} />
      <input type="hidden" name="status" value={next} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "…" : next === "PUBLISHED" ? "Publish" : "Unpublish"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

type Question = {
  id: string;
  type: string;
  prompt: string;
  choices: string[] | null;
  correct_answer: unknown;
};

export function QuestionForm({
  examId,
  question,
  onDone,
}: {
  examId: string;
  question?: Question;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    saveQuestion,
    {},
  );
  const [type, setType] = useState(question?.type ?? "MULTIPLE_CHOICE");
  const choices = question?.choices ?? [];
  const correctText =
    typeof question?.correct_answer === "string" ? question.correct_answer : "";
  const correctIndex = Math.max(0, choices.indexOf(correctText));

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="examId" value={examId} />
      {question ? <input type="hidden" name="questionId" value={question.id} /> : null}

      <div>
        <label htmlFor={`type-${question?.id ?? "new"}`} className={label}>
          Type
        </label>
        <select
          id={`type-${question?.id ?? "new"}`}
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className={field}
        >
          <option value="MULTIPLE_CHOICE">Multiple choice</option>
          <option value="IDENTIFICATION">Identification</option>
        </select>
      </div>

      <div>
        <label htmlFor={`prompt-${question?.id ?? "new"}`} className={label}>
          Question
        </label>
        <textarea
          id={`prompt-${question?.id ?? "new"}`}
          name="prompt"
          rows={2}
          required
          defaultValue={question?.prompt}
          className={field}
        />
      </div>

      {type === "MULTIPLE_CHOICE" ? (
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <div>
            <label htmlFor={`choices-${question?.id ?? "new"}`} className={label}>
              Choices (one per line)
            </label>
            <textarea
              id={`choices-${question?.id ?? "new"}`}
              name="choices"
              rows={4}
              defaultValue={choices.join("\n")}
              className={field}
            />
          </div>
          <div>
            <label htmlFor={`correct-${question?.id ?? "new"}`} className={label}>
              Correct line #
            </label>
            <input
              id={`correct-${question?.id ?? "new"}`}
              name="correctIndex"
              type="number"
              min={0}
              defaultValue={correctIndex}
              className={field}
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              0 = first line
            </p>
          </div>
        </div>
      ) : (
        <div>
          <label htmlFor={`answer-${question?.id ?? "new"}`} className={label}>
            Accepted answers (one per line)
          </label>
          <textarea
            id={`answer-${question?.id ?? "new"}`}
            name="answer"
            rows={3}
            defaultValue={
              Array.isArray(question?.correct_answer)
                ? (question.correct_answer as string[]).join("\n")
                : ""
            }
            className={field}
          />
        </div>
      )}

      <Feedback state={state} />

      <div className="flex gap-3">
        <button type="submit" disabled={pending} className={button}>
          {pending ? "Saving…" : question ? "Update question" : "Add question"}
        </button>
        {onDone ? (
          <button
            type="button"
            onClick={onDone}
            className="text-sm text-slate-500 underline underline-offset-4 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function QuestionRow({
  examId,
  question,
  index,
  locked,
}: {
  examId: string;
  question: Question;
  index: number;
  /** Published exams are frozen in the database; hide the controls to match. */
  locked?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    deleteQuestion,
    {},
  );

  if (editing) {
    return (
      <li className="border-b border-slate-100 p-6 last:border-0 dark:border-slate-800">
        <QuestionForm
          examId={examId}
          question={question}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex items-start justify-between gap-4 border-b border-slate-100 p-6 last:border-0 dark:border-slate-800">
      <div className="min-w-0">
        <p className="text-sm text-slate-900 dark:text-slate-100">
          <span className="mr-2 text-slate-400 dark:text-slate-600">{index + 1}.</span>
          {question.prompt}
        </p>
        <p className="mt-1 text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {question.type.replace("_", " ").toLowerCase()}
          {question.choices?.length ? ` · ${question.choices.length} choices` : ""}
        </p>
        {state.error ? (
          <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">
            {state.error}
          </p>
        ) : null}
      </div>
      {locked ? (
        <span className="shrink-0 text-xs text-slate-400 dark:text-slate-600">locked</span>
      ) : (
      <div className="flex shrink-0 gap-3 text-sm">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-slate-600 underline underline-offset-4 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          Edit
        </button>
        <form action={action}>
          <input type="hidden" name="examId" value={examId} />
          <input type="hidden" name="questionId" value={question.id} />
          <button
            type="submit"
            disabled={pending}
            className="text-slate-600 underline underline-offset-4 hover:text-rose-600 disabled:opacity-50 dark:text-slate-400 dark:hover:text-rose-400"
          >
            {pending ? "…" : "Delete"}
          </button>
        </form>
      </div>
      )}
    </li>
  );
}
