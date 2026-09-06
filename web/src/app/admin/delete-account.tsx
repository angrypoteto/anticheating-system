"use client";

import { useActionState } from "react";
import { deleteAccount, type DeleteAccountState } from "./actions";

const WHY_NOT: Record<string, string> = {
  self: "You cannot delete the account you are signed in with.",
  last_admin:
    "This is the only active administrator. Make somebody else an administrator first.",
  exams: "This account wrote exams. Delete those first, or disable it instead.",
  sections:
    "This account teaches a class. Assign somebody else to it first, or disable it instead.",
};

/**
 * Deleting an account, asked twice.
 *
 * The first press asks what would go and whether it can go at all; only the
 * second does anything. Disabling is next to it and is almost always the right
 * button — it keeps the person's results and stops them signing in. This one is
 * for accounts that should not have existed.
 */
export function DeleteAccount({ userId }: { userId: string }) {
  const [state, submit, pending] = useActionState<DeleteAccountState, FormData>(
    deleteAccount,
    {},
  );
  const asked = state.confirm;
  const blocked = asked?.blocked_by ? WHY_NOT[asked.blocked_by] ?? asked.blocked_by : null;

  return (
    <form action={submit} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />

      {asked && !blocked ? (
        <>
          <span className="text-xs text-red-700 dark:text-red-400">
            Delete {asked.email}
            {asked.sittings
              ? ` and ${asked.sittings} sitting${asked.sittings === 1 ? "" : "s"} of theirs`
              : ""}
            ? This cannot be undone.
          </span>
          <button
            type="submit"
            name="confirm"
            value="yes"
            disabled={pending}
            className="rounded-md bg-red-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Yes, delete"}
          </button>
        </>
      ) : (
        <button
          type="submit"
          disabled={pending}
          className="text-sm text-red-700 underline underline-offset-4 hover:text-red-800 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
        >
          {pending ? "…" : "Delete"}
        </button>
      )}

      {blocked ? (
        <span role="alert" className="text-xs text-amber-700 dark:text-amber-400">
          {blocked}
        </span>
      ) : null}
      {state.error ? (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.error}
        </span>
      ) : null}
      {state.success ? (
        <span role="status" className="text-xs text-green-700 dark:text-green-400">
          {state.success}
        </span>
      ) : null}
    </form>
  );
}
