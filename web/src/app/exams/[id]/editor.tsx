"use client";

import { SubjectPicker, type SubjectOption } from "@/components/subject-picker";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  deleteQuestion,
  saveQuestion,
  updateExamSettings,
  type ActionState,
} from "../actions";
import type { LockdownConfig, TimerConfig } from "@/lib/exam-config";

const field =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-900 focus:ring-3 focus:ring-gray-900/8";
// A short number beside words ("30 minutes"), not a full-width field.
const num =
  "h-9 w-20 rounded-lg border border-gray-300 bg-white px-2.5 text-sm text-gray-900 tabular-nums outline-none focus:border-gray-900 focus:ring-3 focus:ring-gray-900/8 disabled:opacity-40";
const label = "block text-sm font-medium text-gray-900";
const hint = "mt-1 text-[12.5px] leading-snug text-gray-500";
const primary =
  "inline-flex h-10 items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-50";
const secondary =
  "inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition hover:border-gray-400 hover:text-gray-900 disabled:opacity-50";

function Feedback({ state }: { state: ActionState }) {
  if (state.error)
    return (
      <p role="alert" className="text-sm text-red-700">
        {state.error}
      </p>
    );
  if (state.success)
    return (
      <p role="status" className="text-sm text-green-700">
        {state.success}
      </p>
    );
  return null;
}

// --------------------------------------------------------------- questions

type Question = {
  id: string;
  type: string;
  prompt: string;
  choices: string[] | null;
  correct_answer: unknown;
};

const MAX_CHOICES = 8;
const letter = (i: number) => String.fromCharCode(65 + i);

/**
 * Writing or changing one question.
 *
 * It used to be three boxes and a number: the choices typed into one box, one
 * per line, and the right answer given as a line number counted from zero.
 * Nobody outside a programming class counts from zero, and a key pointing at
 * the wrong line is a paper marked wrong for everybody. Now each choice is its
 * own box, and the right one is the one you click — the same circle a student
 * will click.
 *
 * The server still takes the old shape (choices one per line, the index of the
 * right one), so this only builds that shape from what is on screen.
 */
export function QuestionEditor({
  examId,
  question,
  onDone,
}: {
  examId: string;
  question?: Question;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveQuestion, {});
  const id = question?.id ?? "new";

  const [type, setType] = useState(question?.type ?? "MULTIPLE_CHOICE");
  const [prompt, setPrompt] = useState(question?.prompt ?? "");
  const [choices, setChoices] = useState<string[]>(() => {
    const given = question?.choices ?? [];
    return given.length >= 2 ? given : [...given, "", "", "", ""].slice(0, Math.max(4, given.length));
  });
  const [correct, setCorrect] = useState<number | null>(() => {
    const key = question?.correct_answer;
    if (typeof key !== "string") return null;
    const i = (question?.choices ?? []).indexOf(key);
    return i >= 0 ? i : null;
  });
  const [accepted, setAccepted] = useState<string[]>(() => {
    const key = question?.correct_answer;
    const list = Array.isArray(key) ? key.map(String) : typeof key === "string" && question?.type === "IDENTIFICATION" ? [key] : [];
    return list.length ? list : [""];
  });
  const [problem, setProblem] = useState<string | null>(null);
  const choiceRefs = useRef<(HTMLInputElement | null)[]>([]);
  // A choice just added, to put the cursor in once it exists.
  const focusNext = useRef<number | null>(null);

  // Saved: close, and let the page (re-rendered by the action) show the result.
  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  useEffect(() => {
    if (focusNext.current == null) return;
    choiceRefs.current[focusNext.current]?.focus();
    focusNext.current = null;
  }, [choices.length]);

  // What the server is sent: blanks dropped, and the right answer's position
  // counted among what is left.
  const filled = choices.map((c) => c.trim());
  const kept = filled.filter(Boolean);
  const correctIndex =
    correct != null && filled[correct] ? filled.slice(0, correct).filter(Boolean).length : -1;

  function check(e: React.FormEvent<HTMLFormElement>) {
    const why = !prompt.trim()
      ? "Write the question first."
      : type === "MULTIPLE_CHOICE"
        ? kept.length < 2
          ? "Give at least two choices."
          : new Set(kept.map((c) => c.toLowerCase())).size !== kept.length
            ? "Two of the choices are the same."
            : correctIndex < 0
              ? "Click the circle beside the right answer."
              : null
        : !accepted.some((a) => a.trim())
          ? "Give the answer students should type."
          : null;
    setProblem(why);
    if (why) e.preventDefault();
  }

  function addChoice(after?: number) {
    if (choices.length >= MAX_CHOICES) return;
    const at = after == null ? choices.length : after + 1;
    setChoices((c) => [...c.slice(0, at), "", ...c.slice(at)]);
    setCorrect((k) => (k != null && k >= at ? k + 1 : k));
    focusNext.current = at;
  }

  function removeChoice(i: number) {
    setChoices((c) => c.filter((_, j) => j !== i));
    setCorrect((k) => (k == null ? k : k === i ? null : k > i ? k - 1 : k));
  }

  return (
    <form action={action} onSubmit={check} className="space-y-5">
      <input type="hidden" name="examId" value={examId} />
      {question ? <input type="hidden" name="questionId" value={question.id} /> : null}
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="choices" value={kept.join("\n")} />
      <input type="hidden" name="correctIndex" value={correctIndex} />
      <input type="hidden" name="answer" value={accepted.map((a) => a.trim()).filter(Boolean).join("\n")} />

      <fieldset>
        <legend className={label}>Kind of question</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {[
            { value: "MULTIPLE_CHOICE", name: "Multiple choice", says: "Students pick one of the choices" },
            { value: "IDENTIFICATION", name: "Identification", says: "Students type the answer" },
          ].map((t) => (
            <label
              key={t.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 transition ${
                type === t.value ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-400"
              }`}
            >
              <input
                type="radio"
                name={`kind-${id}`}
                checked={type === t.value}
                onChange={() => {
                  setType(t.value);
                  setProblem(null);
                }}
                className="mt-0.5 accent-gray-900"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">{t.name}</span>
                <span className="block text-[12.5px] text-gray-500">{t.says}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor={`prompt-${id}`} className={label}>
          Question
        </label>
        <textarea
          id={`prompt-${id}`}
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          name="prompt"
          placeholder="e.g. Which layer of the OSI model does IP belong to?"
          className={`${field} mt-1.5 resize-y`}
        />
      </div>

      {type === "MULTIPLE_CHOICE" ? (
        <fieldset>
          <legend className={label}>Choices</legend>
          <p className={hint}>
            Click the circle beside the right answer. Students see the choices in a different order each.
          </p>
          <ul className="mt-2.5 space-y-2">
            {choices.map((c, i) => {
              const right = correct === i;
              return (
                <li
                  key={i}
                  className={`flex items-center gap-2.5 rounded-lg border py-1.5 pr-1.5 pl-3 transition ${
                    right ? "border-green-300 bg-green-50" : "border-gray-200 bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name={`correct-${id}`}
                    checked={right}
                    onChange={() => {
                      setCorrect(i);
                      setProblem(null);
                    }}
                    aria-label={`Mark choice ${i + 1} as the correct answer`}
                    className="h-4 w-4 shrink-0 cursor-pointer accent-green-700"
                  />
                  <span aria-hidden className="w-4 shrink-0 text-[12.5px] font-semibold text-gray-400">
                    {letter(i)}
                  </span>
                  <input
                    ref={(el) => {
                      choiceRefs.current[i] = el;
                    }}
                    value={c}
                    onChange={(e) => setChoices((all) => all.map((x, j) => (j === i ? e.target.value : x)))}
                    onKeyDown={(e) => {
                      // Enter moves on to the next choice rather than saving a
                      // half-written question.
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      if (i < choices.length - 1) choiceRefs.current[i + 1]?.focus();
                      else addChoice();
                    }}
                    aria-label={`Choice ${i + 1}`}
                    placeholder={`Choice ${letter(i)}`}
                    className="h-8 min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
                  />
                  {right ? (
                    <span className="hidden shrink-0 text-[12px] font-semibold text-green-700 sm:inline">
                      Right answer
                    </span>
                  ) : null}
                  {choices.length > 2 ? (
                    <button
                      type="button"
                      onClick={() => removeChoice(i)}
                      aria-label={`Remove choice ${i + 1}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-900"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path d="m6.5 6.5 11 11m0-11-11 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {choices.length < MAX_CHOICES ? (
            <button
              type="button"
              onClick={() => addChoice()}
              className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
            >
              <span aria-hidden className="text-base leading-none">+</span> Add a choice
            </button>
          ) : null}
        </fieldset>
      ) : (
        <fieldset>
          <legend className={label}>Right answer</legend>
          <p className={hint}>
            Capital letters and extra spaces are ignored. Add other spellings you would also accept.
          </p>
          <ul className="mt-2.5 space-y-2">
            {accepted.map((a, i) => (
              <li key={i} className="flex items-center gap-2">
                <input
                  value={a}
                  onChange={(e) => setAccepted((all) => all.map((x, j) => (j === i ? e.target.value : x)))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.preventDefault();
                  }}
                  aria-label={`Accepted answer ${i + 1}`}
                  placeholder={i === 0 ? "e.g. DNS" : "Another way to write it"}
                  className={`${field} ${i === 0 ? "border-green-300" : ""}`}
                />
                {accepted.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setAccepted((all) => all.filter((_, j) => j !== i))}
                    aria-label={`Remove accepted answer ${i + 1}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-900"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="m6.5 6.5 11 11m0-11-11 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setAccepted((all) => [...all, ""])}
            className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
          >
            <span aria-hidden className="text-base leading-none">+</span> Add another accepted answer
          </button>
        </fieldset>
      )}

      {problem ? (
        <p role="alert" className="text-sm text-red-700">
          {problem}
        </p>
      ) : (
        <Feedback state={{ error: state.error }} />
      )}

      <div className="flex flex-wrap gap-2.5 border-t border-gray-100 pt-4">
        <button type="submit" disabled={pending} className={primary}>
          {pending ? "Saving…" : "Save question"}
        </button>
        <button type="button" onClick={onDone} className={secondary}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * One question as it will be marked: its choices laid out, the right one in
 * green — the same look as the answer review, so a teacher checking a key and
 * a teacher checking a student see the same thing.
 */
export function QuestionCard({
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
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteQuestion, {});
  const n = index + 1;
  const mc = question.type === "MULTIPLE_CHOICE";
  const key = question.correct_answer;
  const accepted = Array.isArray(key) ? key.map(String) : typeof key === "string" ? [key] : [];

  if (editing) {
    return (
      <li className="border-b border-gray-100 bg-gray-50/60 px-5 py-5 last:border-b-0">
        <p className="mb-4 text-[12.5px] font-medium text-gray-500">Editing question {n}</p>
        <QuestionEditor examId={examId} question={question} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className="border-b border-gray-100 px-5 py-4.5 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium text-gray-400">
            Question {n}, {mc ? "multiple choice" : "identification"}
          </p>
          <p className="mt-1 text-[15px] leading-snug font-medium whitespace-pre-line text-gray-900">
            {question.prompt}
          </p>
        </div>
        {locked ? null : (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`Edit question ${n}`}
              className="inline-flex h-8 items-center rounded-lg px-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label={`Delete question ${n}`}
              className="inline-flex h-8 items-center rounded-lg px-2.5 text-sm text-gray-500 hover:bg-red-50 hover:text-red-700"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {mc ? (
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {(question.choices ?? []).map((c, i) => {
            const right = c === key;
            return (
              <li
                key={c}
                className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-sm ${
                  right ? "border-green-200 bg-green-50 text-green-900" : "border-transparent text-gray-700"
                }`}
              >
                <span
                  className={`flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-md text-[11.5px] font-semibold ${
                    right ? "bg-green-700 text-white" : "border border-gray-200 text-gray-500"
                  }`}
                >
                  {letter(i)}
                </span>
                <span className="min-w-0 flex-1">{c}</span>
                {right ? <span className="sr-only">(right answer)</span> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm text-gray-500">
          Right answer:
          {accepted.length ? (
            accepted.map((a) => (
              <span
                key={a}
                className="inline-flex rounded-md border border-green-200 bg-green-50 px-2 py-0.5 font-medium text-green-800"
              >
                {a}
              </span>
            ))
          ) : (
            <span className="text-red-700">none set</span>
          )}
        </p>
      )}

      {confirming ? (
        <form
          action={action}
          className="mt-3.5 flex flex-wrap items-center gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5"
        >
          <input type="hidden" name="examId" value={examId} />
          <input type="hidden" name="questionId" value={question.id} />
          <span className="mr-auto text-sm text-red-900">Delete this question? This cannot be undone.</span>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="inline-flex h-8 items-center rounded-lg px-3 text-sm text-gray-700 hover:bg-white"
          >
            Keep it
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-8 items-center rounded-lg bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Yes, delete it"}
          </button>
        </form>
      ) : null}
      {state.error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
    </li>
  );
}

/** The closed "add a question" row, which opens into the editor. */
export function AddQuestion({ examId, first }: { examId: string; first?: boolean }) {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <div className="px-5 py-5">
        <p className="mb-4 text-[15px] font-semibold text-gray-900">
          {first ? "Your first question" : "New question"}
        </p>
        <QuestionEditor examId={examId} onDone={() => setOpen(false)} />
      </div>
    );
  }

  return (
    <div className="p-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 text-sm font-medium text-gray-700 transition hover:border-gray-900 hover:bg-gray-50 hover:text-gray-900"
      >
        <span aria-hidden className="text-lg leading-none">+</span>
        Add a question
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- settings

type Protection = Pick<
  LockdownConfig,
  "fullscreenRequired" | "blockCopyPaste" | "honeypot" | "recordScreen" | "detectExtensions" | "maxStrikes"
>;

/**
 * Three levels a teacher can choose between without knowing what a honeypot
 * is. Each is only a set of the switches below; choosing one sets them, and
 * changing a switch by hand is "Custom". Nothing is lost by the shortcut.
 */
const LEVELS: { id: string; name: string; says: string; rules: Protection }[] = [
  {
    id: "relaxed",
    name: "Relaxed",
    says: "For practice quizzes. Leaving the page is noted, but nothing is locked.",
    rules: { fullscreenRequired: false, blockCopyPaste: false, honeypot: true, recordScreen: false, detectExtensions: false, maxStrikes: 5 },
  },
  {
    id: "standard",
    name: "Standard",
    says: "Fullscreen, no copy and paste. Handed in after 3 warnings.",
    rules: { fullscreenRequired: true, blockCopyPaste: true, honeypot: true, recordScreen: false, detectExtensions: true, maxStrikes: 3 },
  },
  {
    id: "strict",
    name: "Strict",
    says: "Everything in Standard, plus a recording of their screen. Handed in after 2 warnings.",
    rules: { fullscreenRequired: true, blockCopyPaste: true, honeypot: true, recordScreen: true, detectExtensions: true, maxStrikes: 2 },
  },
];

const sameRules = (a: Protection, b: Protection) =>
  (Object.keys(b) as (keyof Protection)[]).every((k) => a[k] === b[k]);

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
  const [state, action, pending] = useActionState<ActionState, FormData>(updateExamSettings, {});
  const [timed, setTimed] = useState(timer.totalMinutes > 0);
  const [minutes, setMinutes] = useState(String(timer.totalMinutes || 30));
  const [perQuestion, setPerQuestion] = useState(timer.perQuestionSeconds != null);
  const [rules, setRules] = useState<Protection>({
    fullscreenRequired: lockdown.fullscreenRequired,
    blockCopyPaste: lockdown.blockCopyPaste,
    honeypot: lockdown.honeypot,
    recordScreen: lockdown.recordScreen,
    detectExtensions: lockdown.detectExtensions,
    maxStrikes: lockdown.maxStrikes,
  });
  const level = LEVELS.find((l) => sameRules(rules, l.rules))?.id ?? "custom";
  const [showRules, setShowRules] = useState(level === "custom");
  const set = <K extends keyof Protection>(k: K, v: Protection[K]) => setRules((r) => ({ ...r, [k]: v }));

  const section = "rounded-xl border border-gray-200 bg-white";
  const head = "border-b border-gray-100 px-5 py-4";

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="examId" value={examId} />
      <input type="hidden" name="totalMinutes" value={timed ? minutes : "0"} />
      {rules.fullscreenRequired ? <input type="hidden" name="fullscreenRequired" value="on" /> : null}
      {rules.blockCopyPaste ? <input type="hidden" name="blockCopyPaste" value="on" /> : null}
      {rules.honeypot ? <input type="hidden" name="honeypot" value="on" /> : null}
      {rules.recordScreen ? <input type="hidden" name="recordScreen" value="on" /> : null}
      {rules.detectExtensions ? <input type="hidden" name="detectExtensions" value="on" /> : null}
      <input type="hidden" name="maxStrikes" value={rules.maxStrikes} />

      <section className={section}>
        <div className={head}>
          <h2 className="text-[15px] font-semibold text-gray-900">Name</h2>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <label htmlFor="title" className={label}>
              Title
            </label>
            <input id="title" name="title" defaultValue={title} required className={`${field} mt-1`} />
          </div>
          <SubjectPicker subjects={subjects} defaultId={subjectId} />
        </div>
      </section>

      <section className={section}>
        <div className={head}>
          <h2 className="text-[15px] font-semibold text-gray-900">Time limit</h2>
          <p className={hint}>When time runs out, whatever they have answered is handed in for them.</p>
        </div>
        <div className="space-y-3 p-5">
          <label className="flex items-center gap-3 text-sm text-gray-900">
            <input type="radio" name="timed" checked={!timed} onChange={() => setTimed(false)} className="accent-gray-900" />
            No time limit
          </label>
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-900">
            <label className="flex items-center gap-3">
              <input type="radio" name="timed" checked={timed} onChange={() => setTimed(true)} className="accent-gray-900" />
              Time limit of
            </label>
            <input
              type="number"
              min={1}
              value={minutes}
              onChange={(e) => {
                setMinutes(e.target.value);
                setTimed(true);
              }}
              aria-label="Minutes"
              className={num}
            />
            <span>minutes</span>
          </div>

          <div className="border-t border-gray-100 pt-3">
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-900">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="perQuestionEnabled"
                  checked={perQuestion}
                  onChange={(e) => setPerQuestion(e.target.checked)}
                  className="accent-gray-900"
                />
                Also limit each question to
              </label>
              <input
                name="perQuestionSeconds"
                type="number"
                min={5}
                disabled={!perQuestion}
                defaultValue={timer.perQuestionSeconds ?? 60}
                aria-label="Seconds per question"
                className={num}
              />
              <span className={perQuestion ? "" : "text-gray-400"}>seconds</span>
            </div>
            <p className={`${hint} pl-7`}>It moves on to the next question by itself when the time is up.</p>
          </div>
        </div>
      </section>

      <section className={section}>
        <div className={head}>
          <h2 className="text-[15px] font-semibold text-gray-900">Cheating protection</h2>
          <p className={hint}>
            How closely students are watched. Every warning shows up for you on the results page.
          </p>
        </div>
        <div className="space-y-2 p-5">
          {LEVELS.map((l) => (
            <label
              key={l.id}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 transition ${
                level === l.id ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-400"
              }`}
            >
              <input
                type="radio"
                name="level"
                checked={level === l.id}
                onChange={() => setRules(l.rules)}
                className="mt-0.5 accent-gray-900"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">
                  {l.name}
                  {l.id === "standard" ? (
                    <span className="ml-2 text-[12px] font-medium text-gray-500">recommended</span>
                  ) : null}
                </span>
                <span className="block text-[12.5px] text-gray-500">{l.says}</span>
              </span>
            </label>
          ))}
          {level === "custom" ? (
            <p className="px-1 text-[12.5px] text-gray-500">Custom: you have set the rules below by hand.</p>
          ) : null}

          <button
            type="button"
            onClick={() => setShowRules((s) => !s)}
            aria-expanded={showRules}
            className="mt-1 inline-flex h-9 items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            <svg
              className={`h-4 w-4 transition-transform ${showRules ? "rotate-90" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {showRules ? "Hide the individual rules" : "Choose the rules one by one"}
          </button>

          {showRules ? (
            <div className="space-y-3.5 rounded-lg border border-gray-100 bg-gray-50/60 p-4">
              {(
                [
                  ["fullscreenRequired", "Keep the exam in fullscreen", "The questions are hidden until they go back to fullscreen."],
                  ["blockCopyPaste", "Block copy, paste and right-click", "So questions cannot be pasted into a search or a chatbot."],
                  ["recordScreen", "Record their screen", "They share their whole screen before starting, and you can watch it beside each warning. Needs a computer with Chrome, Edge or Firefox."],
                  ["detectExtensions", "Flag browser extensions that change the page", "Shown to you, never counted as a warning."],
                  ["honeypot", "Add a hidden trap field", "Invisible to students; only an auto-fill tool or a bot would fill it in."],
                ] as const
              ).map(([k, name, says]) => (
                <label key={k} className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={rules[k]}
                    onChange={(e) => set(k, e.target.checked)}
                    className="mt-0.5 accent-gray-900"
                  />
                  <span>
                    <span className="block text-gray-900">{name}</span>
                    <span className="block text-[12.5px] text-gray-500">{says}</span>
                  </span>
                </label>
              ))}
              <div className="flex flex-wrap items-center gap-3 border-t border-gray-200/70 pt-3.5 text-sm text-gray-900">
                <label htmlFor="maxStrikes-input">Hand it in automatically after</label>
                <input
                  id="maxStrikes-input"
                  type="number"
                  min={1}
                  value={rules.maxStrikes}
                  onChange={(e) => set("maxStrikes", Math.max(1, Number(e.target.value) || 1))}
                  className={num}
                />
                <span>warnings</span>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className={primary}>
          {pending ? "Saving…" : "Save settings"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}
