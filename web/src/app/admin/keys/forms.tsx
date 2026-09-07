"use client";

import { useActionState, useState } from "react";
import { PROVIDER_PRESETS, presetFor } from "@/lib/ai/providers";
import {
  addKey,
  deleteKey,
  setKeyStatus,
  testAllKeys,
  testKey,
  type KeyState,
  type TestAllState,
} from "./actions";

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
  const [presetId, setPresetId] = useState("gemini");
  const preset = presetFor(presetId);
  const custom = presetId === "custom";
  const needsEndpoint = (preset?.apiStyle ?? "openai") === "openai";

  return (
    <form action={action} className="space-y-4">
      {/* Two columns, not three: the label used to sit here and be typed, and
          what got typed was an email address, which then appeared beside every
          exam it generated. It is named automatically now. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="preset" className={label}>Provider</label>
          <select
            id="preset"
            name="preset"
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
            className={field}
          >
            {PROVIDER_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          {preset?.hint ? (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{preset.hint}</p>
          ) : null}
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

      {custom ? (
        <div>
          <label htmlFor="customName" className={label}>Provider name</label>
          <input
            id="customName"
            name="customName"
            placeholder="e.g. together"
            required
            className={field}
          />
        </div>
      ) : null}

      {/* Gemini is reached through Google's own API and needs no endpoint. */}
      {needsEndpoint ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="baseUrl" className={label}>API base URL</label>
            <input
              id="baseUrl"
              name="baseUrl"
              key={`url-${presetId}`}
              defaultValue={preset?.baseUrl ?? ""}
              placeholder="https://api.example.com/v1"
              className={field}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Must speak the OpenAI chat-completions API. Do not include
              /chat/completions.
            </p>
          </div>
          <div>
            <label htmlFor="model" className={label}>Model</label>
            <input
              id="model"
              name="model"
              key={`model-${presetId}`}
              defaultValue={preset?.defaultModel ?? ""}
              placeholder="model-name"
              className={field}
            />
          </div>
        </div>
      ) : (
        <div className="sm:max-w-xs">
          <label htmlFor="model" className={label}>Model (optional)</label>
          <input
            id="model"
            name="model"
            key={`model-${presetId}`}
            defaultValue={preset?.defaultModel ?? ""}
            className={field}
          />
        </div>
      )}

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

/**
 * Ask every key at once.
 *
 * The question an admin has on this page is almost never "does key 3 work" —
 * it is "will generation run tomorrow", and one key answering is enough for
 * that. Testing them one at a time meant six presses and six answers held in
 * the head to work out one thing, so the summary answers it in a sentence
 * before the list explains itself.
 */
export function TestAllKeys({ count }: { count: number }) {
  const [state, action, pending] = useActionState<TestAllState, FormData>(testAllKeys, {});
  const verdicts = state.verdicts ?? [];
  const answered = verdicts.filter((v) => v.ok).length;

  return (
    <div>
      <form action={action}>
        <button
          type="submit"
          disabled={pending || count === 0}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 text-[13.5px] font-medium text-gray-800 transition hover:border-gray-300 disabled:opacity-50"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 4.75a7.25 7.25 0 1 0 7.25 7.25"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
            <path
              d="M19.25 5.5v4h-4"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {pending
            ? `Asking ${count} key${count === 1 ? "" : "s"}…`
            : `Test all ${count} key${count === 1 ? "" : "s"}`}
        </button>
      </form>

      {state.error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      {verdicts.length ? (
        <div
          role="status"
          className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white"
        >
          {/* The answer to the question, before the evidence for it. */}
          <p
            className={`border-b px-4.5 py-3 text-sm font-medium ${
              answered
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {answered
              ? `${answered} of ${verdicts.length} answered — generation will run.`
              : "None of them answered. Generation will fail until one does."}
          </p>
          <ul>
            {verdicts.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-gray-100 px-4.5 py-2.75 text-[13px] last:border-b-0"
              >
                <span className="font-medium text-gray-900">{v.label}</span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.25 py-0.5 text-xs font-medium ${
                    v.tone === "good"
                      ? "border-green-200 bg-green-50 text-green-800"
                      : v.tone === "warn"
                        ? "border-amber-200 bg-amber-50 text-amber-900"
                        : "border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  {v.tone === "good" ? (
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
                  ) : null}
                  {v.ok ? "Working" : v.tone === "warn" ? "Waiting" : "Broken"}
                </span>
                <span className="min-w-0 flex-1 text-gray-600">{v.say}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
