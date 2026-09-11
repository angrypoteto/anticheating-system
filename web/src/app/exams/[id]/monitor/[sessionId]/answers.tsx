"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { forceSubmit, markAnswer, type MonitorState } from "../actions";

export type ReviewAnswer = {
  questionId: string;
  /** Position in the paper as the teacher wrote it, not the student's shuffle. */
  n: number;
  prompt: string;
  type: "MULTIPLE_CHOICE" | "IDENTIFICATION";
  choices: string[] | null;
  /** What the student gave; null when the question was left blank. */
  response: string | null;
  /** The key: one choice, or every accepted spelling. */
  accepted: string[];
  /** What the key alone says about the answer. */
  byKey: boolean;
  /** The teacher's own mark, when there is one. It wins over the key. */
  teacherMark: boolean | null;
  markedBy: string | null;
};

type Filter = "all" | "wrong" | "changed" | "blank";

/**
 * The way out of "marks can be changed once the paper is handed in".
 *
 * A paper is only handed in by the student's own browser, so one whose student
 * closed the tab and never came back stays open for ever — and an open paper
 * cannot be marked. When its time has already run out this says so and hands
 * it in as time-up; while the student may still be working it asks first,
 * because ending somebody's exam under them is not a click to make by accident.
 */
export function HandIn({
  examId,
  sessionId,
  ranOutAt,
}: {
  examId: string;
  sessionId: string;
  /** When its time ran out, if it has; null while the student still has time. */
  ranOutAt: string | null;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<MonitorState, FormData>(forceSubmit, {});
  const [sure, setSure] = useState(false);
  useEffect(() => {
    if (state.success) router.refresh();
  }, [state, router]);

  const button = (label: string) => (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-9 items-center rounded-lg bg-gray-900 px-3.5 text-sm font-medium whitespace-nowrap text-white hover:bg-gray-700 disabled:opacity-50"
    >
      {pending ? "Handing in…" : label}
    </button>
  );

  return (
    <section
      className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border px-5 py-4 ${
        ranOutAt ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-white"
      }`}
    >
      <div className="min-w-0 flex-1 basis-[22rem]">
        <p className="text-[15px] font-semibold text-gray-900">
          {ranOutAt ? "Time ran out, but this paper was never handed in" : "This paper is still being sat"}
        </p>
        <p className="mt-0.5 text-[13px] leading-snug text-gray-600">
          {ranOutAt
            ? `Their time was up at ${ranOutAt}. The browser was probably closed before it could hand the paper in. Hand it in now to score it and check the marking.`
            : "Marks can be changed once it is handed in. Ending it now stops the student where they are and scores what they have answered."}
        </p>
        {state.error ? (
          <p role="alert" className="mt-1.5 text-[13px] text-red-700">
            {state.error}
          </p>
        ) : null}
      </div>
      <form action={action} className="flex items-center gap-2">
        <input type="hidden" name="examId" value={examId} />
        <input type="hidden" name="sessionId" value={sessionId} />
        {ranOutAt ? (
          button("Hand it in now")
        ) : sure ? (
          <>
            <button
              type="button"
              onClick={() => setSure(false)}
              className="inline-flex h-9 items-center rounded-lg border border-gray-200 px-3.5 text-sm font-medium text-gray-700 hover:border-gray-400"
            >
              Keep it open
            </button>
            {button("Yes, end it now")}
          </>
        ) : (
          <button
            type="button"
            onClick={() => setSure(true)}
            className="inline-flex h-9 items-center rounded-lg border border-gray-300 px-3.5 text-sm font-medium text-gray-900 hover:border-gray-900"
          >
            End the sitting
          </button>
        )}
      </form>
    </section>
  );
}

const verdict = (r: ReviewAnswer) =>
  r.response == null ? "blank" : (r.teacherMark ?? r.byKey) ? "correct" : "wrong";

/**
 * A handed-in paper, question by question, for checking the marking.
 *
 * The key is right most of the time and wrong in the ways that matter: an
 * identification answer spelt a little differently, a key that was simply
 * mistaken, an ambiguous question read fairly. Each answer shows what the
 * student gave beside what the key accepts, and a teacher can mark it right or
 * wrong themselves — which then counts everywhere a score is shown — or hand
 * it back to the key. Blank answers score nothing and have nothing to mark.
 */
export function AnswerReview({
  examId,
  sessionId,
  rows,
  live,
}: {
  examId: string;
  sessionId: string;
  rows: ReviewAnswer[];
  live: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const counted = rows.filter((r) => verdict(r) === "correct").length;
  const wrong = rows.filter((r) => verdict(r) === "wrong").length;
  const blank = rows.filter((r) => verdict(r) === "blank").length;
  const changed = rows.filter((r) => r.teacherMark != null).length;

  const shown = rows.filter((r) =>
    filter === "all"
      ? true
      : filter === "changed"
        ? r.teacherMark != null
        : verdict(r) === filter,
  );

  const chips: { id: Filter; label: string; n: number }[] = [
    { id: "all", label: "All", n: rows.length },
    { id: "wrong", label: "Wrong", n: wrong },
    { id: "changed", label: "Changed by a teacher", n: changed },
    { id: "blank", label: "Blank", n: blank },
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-gray-900">Answers</h2>
          <p className="mt-0.5 text-[12.5px] text-gray-500">
            {counted} of {rows.length} counted as correct
            {changed ? `, ${changed} ${changed === 1 ? "mark" : "marks"} changed by a teacher` : ""}.
            {live ? " Marks can be changed once it is handed in." : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilter(c.id)}
              aria-pressed={filter === c.id}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium ${
                filter === c.id
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"
              }`}
            >
              {c.label}
              <span className={`tabular-nums ${filter === c.id ? "text-gray-300" : "text-gray-400"}`}>
                {c.n}
              </span>
            </button>
          ))}
        </div>
      </div>

      {shown.length ? (
        <ol>
          {shown.map((r) => (
            <AnswerRow key={r.questionId} examId={examId} sessionId={sessionId} row={r} live={live} />
          ))}
        </ol>
      ) : (
        <p className="p-5 text-sm text-gray-500">Nothing to show here.</p>
      )}
    </section>
  );
}

function AnswerRow({
  examId,
  sessionId,
  row,
  live,
}: {
  examId: string;
  sessionId: string;
  row: ReviewAnswer;
  live: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<MonitorState, FormData>(markAnswer, {});
  useEffect(() => {
    if (state.success) router.refresh();
  }, [state, router]);

  const v = verdict(row);
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const picked = (c: string) => row.response != null && norm(row.response) === norm(c);
  const isKey = (c: string) => row.accepted.some((k) => norm(k) === norm(c));

  const pill =
    v === "correct"
      ? "bg-green-50 text-green-800"
      : v === "wrong"
        ? "bg-red-50 text-red-800"
        : "bg-gray-100 text-gray-600";

  const markButton = (mark: "correct" | "wrong" | "key", label: string, primary = false) => (
    <form action={action}>
      <input type="hidden" name="examId" value={examId} />
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="questionId" value={row.questionId} />
      <input type="hidden" name="mark" value={mark} />
      <button
        type="submit"
        disabled={pending}
        className={
          primary
            ? "inline-flex h-8 items-center rounded-lg bg-gray-900 px-3 text-[13px] font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            : "inline-flex h-8 items-center rounded-lg border border-gray-200 px-3 text-[13px] font-medium text-gray-700 hover:border-gray-400 disabled:opacity-50"
        }
      >
        {pending ? "Saving…" : label}
      </button>
    </form>
  );

  return (
    <li className="border-b border-gray-100 px-5 py-4.5 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-[28rem]">
          <p className="text-[12.5px] font-medium text-gray-400">
            Question {row.n}, {row.type === "MULTIPLE_CHOICE" ? "multiple choice" : "identification"}
          </p>
          <p className="mt-1 text-[15px] leading-snug font-medium text-gray-900">{row.prompt}</p>

          {row.type === "MULTIPLE_CHOICE" && row.choices?.length ? (
            <ul className="mt-3 space-y-1.5">
              {row.choices.map((c, i) => (
                <li
                  key={c}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm ${
                    picked(c) ? (v === "correct" ? "bg-green-50" : "bg-red-50") : ""
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[12px] font-semibold ${
                      picked(c) ? "bg-gray-900 text-white" : "border border-gray-200 text-gray-500"
                    }`}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="min-w-0 flex-1 text-gray-800">{c}</span>
                  {picked(c) ? <span className="text-[12px] font-medium text-gray-500">Their answer</span> : null}
                  {isKey(c) ? (
                    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-green-700">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Key
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
              <dt className="text-gray-500">Their answer</dt>
              <dd className={row.response == null ? "text-gray-400" : "font-medium text-gray-900"}>
                {row.response == null ? "Left blank" : row.response}
              </dd>
              <dt className="text-gray-500">The key accepts</dt>
              <dd className="text-gray-700">{row.accepted.length ? row.accepted.join(", or ") : "Nothing set"}</dd>
            </dl>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-[12.5px] font-semibold ${pill}`}>
            {v === "correct" ? "Correct" : v === "wrong" ? "Wrong" : "Blank"}
          </span>
          {row.teacherMark != null ? (
            <span className="text-[12px] leading-snug text-gray-500 sm:text-right">
              Marked by {row.markedBy ?? "a teacher"}
              <br />
              The key said {row.byKey ? "correct" : "wrong"}
            </span>
          ) : null}
          {!live && row.response != null ? (
            <div className="flex flex-wrap gap-1.5 sm:justify-end">
              {v === "wrong" ? markButton("correct", "Mark correct", true) : markButton("wrong", "Mark wrong")}
              {row.teacherMark != null ? markButton("key", "Use the key's mark") : null}
            </div>
          ) : null}
          {state.error ? (
            <p role="alert" className="max-w-[16rem] text-[12.5px] text-red-700 sm:text-right">
              {state.error}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}
