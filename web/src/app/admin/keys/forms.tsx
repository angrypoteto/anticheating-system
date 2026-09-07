"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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

/** Five minutes. See the note on testAllKeys for why this is not five seconds. */
const EVERY_MS = 5 * 60_000;

function relative(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  return `${h} hour${h === 1 ? "" : "s"} ago`;
}

/**
 * Whether generation will run, kept current without being asked.
 *
 * This used to be a button. The button was the wrong shape for the question:
 * nobody wants to know whether the keys worked at the moment they pressed
 * something, they want to know whether the thing will work — so the page finds
 * out on its own and says how fresh the answer is.
 *
 * It re-checks every five minutes and only while the tab is in front. A
 * background tab quietly spending a provider's quota is exactly the failure
 * this screen is supposed to catch, so it stops when nobody is looking and
 * catches up the moment the tab comes back.
 */
export function LiveKeyCheck({ count }: { count: number }) {
  const [state, setState] = useState<TestAllState>({});
  const [checking, setChecking] = useState(false);
  const [ago, setAgo] = useState<string | null>(null);
  const lastAt = useRef<number | null>(null);

  useEffect(() => {
    if (!count) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const plan = (inMs: number) => {
      if (!live) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, inMs);
    };

    const run = async () => {
      if (!live) return;
      // Nobody is looking: come back when they are, rather than spending a
      // request on an unwatched tab.
      if (typeof document !== "undefined" && document.hidden) return plan(EVERY_MS);

      setChecking(true);
      try {
        const next = await testAllKeys();
        if (!live) return;
        setState(next);
        lastAt.current = Date.now();
      } catch {
        if (live) setState({ error: "Could not reach the server to check the keys." });
      } finally {
        if (live) setChecking(false);
      }
      plan(EVERY_MS);
    };

    // Deferred rather than called in the effect body: reading the clock and
    // setting state during the effect is a render-phase write.
    plan(0);

    const onShow = () => {
      if (document.hidden) return;
      const since = lastAt.current == null ? Infinity : Date.now() - lastAt.current;
      if (since >= EVERY_MS) plan(0);
    };
    document.addEventListener("visibilitychange", onShow);

    return () => {
      live = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [count]);

  // The freshness stamp ticks on its own, so "just now" does not sit there
  // being wrong for five minutes.
  useEffect(() => {
    const tick = () =>
      setAgo(lastAt.current == null ? null : relative(Date.now() - lastAt.current));
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [state]);

  if (!count) return null;

  const verdicts = state.verdicts ?? [];
  const answered = verdicts.filter((v) => v.ok).length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
          <span
            aria-hidden
            className={`h-2 w-2 rounded-full ${
              checking
                ? "animate-pulse bg-teal-600 ring-3 ring-teal-50"
                : verdicts.length === 0
                  ? "bg-gray-300 ring-3 ring-gray-100"
                  : answered
                    ? "bg-green-700 ring-3 ring-green-50"
                    : "bg-red-700 ring-3 ring-red-50"
            }`}
          />
          {checking
            ? `Asking ${count} key${count === 1 ? "" : "s"}…`
            : verdicts.length === 0
              ? "Checking the keys…"
              : answered
                ? `${answered} of ${verdicts.length} answered — generation will run.`
                : "None answered. Generation will fail until one does."}
        </span>
        {ago && !checking ? (
          <span className="text-[13px] text-gray-500">checked {ago}</span>
        ) : null}
      </div>

      <p className="mt-1.5 text-[13px] text-gray-500">
        Re-checked every five minutes while this page is open. Each check is a
        real request to each provider, so it is paced rather than constant.
      </p>

      {state.error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      {verdicts.length ? (
        <ul
          aria-live="polite"
          className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white"
        >
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
      ) : null}
    </div>
  );
}
