"use client";

import { useActionState } from "react";
import {
  assignInstructor,
  setEnrollment,
  createAccount,
  createSection,
  setAccountStatus,
  type ActionState,
} from "./actions";

const field =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-gray-400";
const label = "block text-sm font-medium text-gray-700 dark:text-gray-300";
const button =
  "rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300";

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

export function CreateAccountForm({
  classes,
}: {
  classes: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createAccount,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="email" className={label}>
            Email
          </label>
          <input id="email" name="email" type="email" required className={field} />
        </div>
        <div>
          <label htmlFor="password" className={label}>
            Temporary password
          </label>
          <input
            id="password"
            name="password"
            type="text"
            minLength={8}
            required
            className={field}
          />
        </div>
        <div>
          <label htmlFor="role" className={label}>
            Role
          </label>
          <select id="role" name="role" required defaultValue="STUDENT" className={field}>
            <option value="STUDENT">Student</option>
            <option value="INSTRUCTOR">Instructor</option>
          </select>
        </div>
        <div>
          <label htmlFor="sectionId" className={label}>
            First class (optional)
          </label>
          <select id="sectionId" name="sectionId" defaultValue="" className={field}>
            <option value="">— none —</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Students only. You can add more classes afterwards.
          </p>
        </div>
      </div>

      <Feedback state={state} />

      <button type="submit" disabled={pending} className={button}>
        {pending ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}

export function CreateSectionForm({
  instructors,
}: {
  instructors: { id: string; email: string }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createSection,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="subject" className={label}>
            Subject
          </label>
          <input
            id="subject"
            name="subject"
            placeholder="System Administration"
            required
            className={field}
          />
        </div>
        <div>
          <label htmlFor="name" className={label}>
            Section
          </label>
          <input
            id="name"
            name="name"
            placeholder="BSIT 4C"
            required
            className={field}
          />
        </div>
        <div>
          <label htmlFor="instructorId" className={label}>
            Teacher (optional)
          </label>
          <select id="instructorId" name="instructorId" defaultValue="" className={field}>
            <option value="">— assign later —</option>
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.email}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Feedback state={state} />

      <button type="submit" disabled={pending} className={button}>
        {pending ? "Creating…" : "Create class"}
      </button>
    </form>
  );
}

export function StatusToggle({
  userId,
  status,
}: {
  userId: string;
  status: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    setAccountStatus,
    {},
  );
  const next = status === "ACTIVE" ? "DISABLED" : "ACTIVE";

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="status" value={next} />
      <button
        type="submit"
        disabled={pending}
        className="text-sm text-gray-600 underline underline-offset-4 hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-100"
      >
        {pending ? "…" : status === "ACTIVE" ? "Disable" : "Enable"}
      </button>
      {state.error ? (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}


/** Staff or re-staff a class from the class list. */
export function AssignInstructor({
  sectionId,
  current,
  instructors,
}: {
  sectionId: string;
  current: string | null;
  instructors: { id: string; email: string; full_name?: string | null }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    assignInstructor,
    {},
  );

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="sectionId" value={sectionId} />
      <select
        name="instructorId"
        defaultValue={current ?? ""}
        className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
      >
        <option value="">— no teacher —</option>
        {instructors.map((i) => (
          <option key={i.id} value={i.id}>
            {i.full_name || i.email}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="text-sm text-gray-600 underline underline-offset-4 hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-100"
      >
        {pending ? "…" : "Save"}
      </button>
      {state.error ? (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">{state.error}</span>
      ) : null}
      {state.success ? (
        <span role="status" className="text-xs text-green-700 dark:text-green-400">{state.success}</span>
      ) : null}
    </form>
  );
}


/** Enrol a student in a class, or drop them from it. */
export function EnrollmentToggle({
  studentId,
  sectionId,
  enrolled,
  label: classLabel,
}: {
  studentId: string;
  sectionId: string;
  enrolled: boolean;
  label: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    setEnrollment,
    {},
  );

  return (
    <form action={action} className="inline">
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="sectionId" value={sectionId} />
      <input type="hidden" name="enrol" value={enrolled ? "0" : "1"} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`${enrolled ? "Remove from" : "Add to"} ${classLabel}`}
        className={`rounded-full border px-2.5 py-1 text-xs transition disabled:opacity-50 ${
          enrolled
            ? "border-teal-300 bg-teal-50 text-teal-800 hover:border-red-300 hover:bg-red-50 hover:text-red-800 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-300 dark:hover:border-red-900 dark:hover:bg-red-950/50 dark:hover:text-red-300"
            : "border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:text-gray-100"
        }`}
      >
        {enrolled ? "✓ " : "+ "}
        {classLabel}
      </button>
      {state.error ? (
        <span role="alert" className="ml-2 text-xs text-red-600 dark:text-red-400">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
