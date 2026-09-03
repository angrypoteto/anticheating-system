"use client";

import { useActionState } from "react";
import {
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
  sections,
}: {
  sections: { id: string; name: string }[];
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
            Section (optional)
          </label>
          <select id="sectionId" name="sectionId" defaultValue="" className={field}>
            <option value="">— none —</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
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
          <label htmlFor="name" className={label}>
            Section name
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
            Instructor
          </label>
          <select id="instructorId" name="instructorId" required defaultValue="" className={field}>
            <option value="" disabled>
              {instructors.length ? "— pick one —" : "— create an instructor first —"}
            </option>
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.email}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Feedback state={state} />

      <button
        type="submit"
        disabled={pending || instructors.length === 0}
        className={button}
      >
        {pending ? "Creating…" : "Create section"}
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
