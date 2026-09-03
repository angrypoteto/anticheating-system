"use client";

import { useActionState } from "react";
import { addKey, deleteKey, setKeyStatus, testKey, type KeyState } from "./actions";

const field =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100";
const label = "block text-sm font-medium text-gray-700 dark:text-gray-300";
const button =
  "rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900";
const linkBtn =
  "text-sm text-gray-600 underline underline-offset-4 hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-100";

function Feedback({ state }: { state: KeyState }) {
  if (state.error)
    return <p role="alert" className="text-sm text-red-600 dark:text-red-400">{state.error}</p>;
  if (state.success)
    return <p role="status" className="text-sm text-green-700 dark:text-green-400">{state.success}</p>;
  return null;
}

export function AddKeyForm() {
  const [state, action, pending] = useActionState<KeyState, FormData>(addKey, {});

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="provider" className={label}>Provider</label>
          <select id="provider" name="provider" defaultValue="gemini" className={field}>
            <option value="gemini">Google Gemini</option>
          </select>
        </div>
        <div>
          <label htmlFor="label" className={label}>Label</label>
          <input id="label" name="label" placeholder="Key 1" required className={field} />
        </div>
        <div>
          <label htmlFor="secret" className={label}>API key</label>
          <input
            id="secret"
            name="secret"
            type="password"
            autoComplete="off"
            required
            className={field}
          />
        </div>
      </div>

      <Feedback state={state} />

      <button type="submit" disabled={pending} className={button}>
        {pending ? "Storing…" : "Add key"}
      </button>
    </form>
  );
}

export function KeyRow({
  id,
  label: keyLabel,
  provider,
  hint,
  status,
  lastUsed,
  lastError,
}: {
  id: string;
  label: string;
  provider: string;
  hint: string;
  status: string;
  lastUsed: string | null;
  lastError: string | null;
}) {
  const [statusState, statusAction, statusPending] = useActionState<KeyState, FormData>(setKeyStatus, {});
  const [testState, testAction, testPending] = useActionState<KeyState, FormData>(testKey, {});
  const [delState, delAction, delPending] = useActionState<KeyState, FormData>(deleteKey, {});
  const active = status === "ACTIVE";

  return (
    <li className="border-b border-gray-100 p-6 last:border-0 dark:border-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 dark:text-gray-100">
            {keyLabel}{" "}
            <span className="ml-1 font-mono text-xs text-gray-400 dark:text-gray-500">
              ••••{hint}
            </span>
          </p>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {provider} ·{" "}
            <span className={active ? "text-green-700 dark:text-green-400" : "text-gray-400"}>
              {status.toLowerCase()}
            </span>
            {lastUsed ? ` · last used ${new Date(lastUsed).toLocaleString()}` : " · never used"}
          </p>
          {lastError ? (
            <p className="mt-1 max-w-xl text-xs text-amber-700 dark:text-amber-400">
              last error: {lastError}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <form action={testAction}>
            <input type="hidden" name="keyId" value={id} />
            <button type="submit" disabled={testPending} className={linkBtn}>
              {testPending ? "…" : "Test"}
            </button>
          </form>
          <form action={statusAction}>
            <input type="hidden" name="keyId" value={id} />
            <input type="hidden" name="status" value={active ? "DISABLED" : "ACTIVE"} />
            <button type="submit" disabled={statusPending} className={linkBtn}>
              {statusPending ? "…" : active ? "Disable" : "Enable"}
            </button>
          </form>
          <form action={delAction}>
            <input type="hidden" name="keyId" value={id} />
            <button
              type="submit"
              disabled={delPending}
              className="text-sm text-gray-600 underline underline-offset-4 hover:text-red-600 disabled:opacity-50 dark:text-gray-400 dark:hover:text-red-400"
            >
              {delPending ? "…" : "Delete"}
            </button>
          </form>
        </div>
      </div>

      <div className="mt-2 space-y-1">
        <Feedback state={testState} />
        <Feedback state={statusState} />
        <Feedback state={delState} />
      </div>
    </li>
  );
}
