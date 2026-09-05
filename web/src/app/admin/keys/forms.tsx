"use client";

import { useActionState, useState } from "react";
import { PROVIDER_PRESETS, presetFor } from "@/lib/ai/providers";
import { addKey, deleteKey, setKeyStatus, testKey, type KeyState } from "./actions";

const field =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const label = "block text-sm font-medium text-slate-700 dark:text-slate-300";
const button =
  "rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900";
const linkBtn =
  "text-sm text-slate-600 underline underline-offset-4 hover:text-slate-900 disabled:opacity-50 dark:text-slate-400 dark:hover:text-slate-100";

function Feedback({ state }: { state: KeyState }) {
  if (state.error)
    return <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{state.error}</p>;
  if (state.success)
    return <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{state.success}</p>;
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
      <div className="grid gap-4 sm:grid-cols-3">
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
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{preset.hint}</p>
          ) : null}
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
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
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
    <li className="border-b border-slate-100 p-6 last:border-0 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-slate-900 dark:text-slate-100">
            {keyLabel}{" "}
            <span className="ml-1 font-mono text-xs text-slate-400 dark:text-slate-500">
              ••••{hint}
            </span>
          </p>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {provider} ·{" "}
            <span className={active ? "text-emerald-700 dark:text-emerald-400" : "text-slate-400"}>
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
              className="text-sm text-slate-600 underline underline-offset-4 hover:text-rose-600 disabled:opacity-50 dark:text-slate-400 dark:hover:text-rose-400"
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
