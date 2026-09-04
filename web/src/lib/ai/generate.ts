import "server-only";

import { listActiveKeys, markKeyError, markKeyUsed, revealKey, type KeyRow } from "./keys";
import type { DraftQuestion } from "./gemini";
import { buildPrompt, sanitize, RESPONSE_SCHEMA } from "./gemini";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";

export type GenerateResult =
  | { ok: true; questions: DraftQuestion[]; keyLabel: string; provider: string }
  | { ok: false; error: string };

type Attempt = { ok: true; text: string } | { ok: false; status: number; detail: string };

/**
 * How long one model call may take.
 *
 * This has to sit well inside the serverless function's own limit — the page
 * carries maxDuration = 60, and a call allowed to run for two minutes could
 * never fail gracefully: the platform killed the whole request first and the
 * teacher got a browser error page with no message in it at all.
 */
export const MODEL_CALL_TIMEOUT_MS = 25_000;

async function callGemini(
  key: KeyRow,
  secret: string,
  prompt: string,
  timeoutMs: number,
): Promise<Attempt> {
  const model = key.model || DEFAULT_GEMINI_MODEL;
  const res = await fetch(
    `${GEMINI_ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(secret)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    },
  );

  if (!res.ok) return { ok: false, status: res.status, detail: (await res.text()).slice(0, 200) };
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof text === "string"
    ? { ok: true, text }
    : { ok: false, status: 502, detail: "model returned no content" };
}

/** Groq, OpenAI, OpenRouter, DeepSeek and anything else speaking that shape. */
async function callOpenAiCompatible(
  key: KeyRow,
  secret: string,
  prompt: string,
  timeoutMs: number,
): Promise<Attempt> {
  if (!key.base_url) return { ok: false, status: 400, detail: "no base URL configured" };
  const url = `${key.base_url.replace(/\/+$/, "")}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify({
      model: key.model || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You write exam questions. Reply with a JSON array only — no prose, no code fences.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) return { ok: false, status: res.status, detail: (await res.text()).slice(0, 200) };
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content;
  return typeof text === "string"
    ? { ok: true, text }
    : { ok: false, status: 502, detail: "model returned no content" };
}

/**
 * Models that answer in prose sometimes wrap the array in a fence, and some
 * return an object with the array under a key. Recover both rather than
 * discarding an otherwise good response.
 */
function parseQuestions(raw: string): unknown {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) return null;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const values = Object.values(parsed as Record<string, unknown>);
    const arr = values.find((v) => Array.isArray(v));
    if (arr) return arr;
  }
  return null;
}

/**
 * Tries every active key in turn, whatever provider it belongs to, so a
 * rate-limited Gemini key can fall through to a Groq one.
 */
/**
 * Ask the model for one word, through the same endpoint generation uses.
 *
 * The point is that "the key works" and "questions can be generated" are the
 * same claim. Testing against the provider's model-listing endpoint proved only
 * that the credential was valid: it answered happily while generateContent was
 * returning 503, so the console reported a working key over a failing one.
 */
export async function pingModel(
  key: KeyRow,
  secret: string,
): Promise<{ ok: boolean; status: number; detail: string }> {
  const prompt = "Reply with the single word: OK";
  const attempt =
    key.api_style === "openai"
      ? await callOpenAiCompatible(key, secret, prompt, 15_000)
      : await callGemini(key, secret, prompt, 15_000);

  return attempt.ok
    ? { ok: true, status: 200, detail: "" }
    : { ok: false, status: attempt.status, detail: attempt.detail };
}

export async function generateQuestions(
  text: string,
  count: number,
  mix: string,
  /**
   * When the caller must have an answer by, as an epoch time. Retries and
   * further keys are only attempted while there is room for them: without this
   * a busy model could spend three calls and two backoffs — some eighty
   * seconds — inside a function the platform kills at sixty.
   */
  deadline = Date.now() + MODEL_CALL_TIMEOUT_MS * 2,
): Promise<GenerateResult> {
  if (!text.trim()) return { ok: false, error: "The lesson file had no readable text." };

  const keys = await listActiveKeys();
  if (!keys.length) {
    return { ok: false, error: "No active AI provider key. Add one in the admin console." };
  }

  const prompt = buildPrompt(text, count, mix);
  let lastError = "All keys failed.";

  /** What one call may take now: never more than its own cap, never past the deadline. */
  const budget = () => Math.min(MODEL_CALL_TIMEOUT_MS, deadline - Date.now());

  for (const key of keys) {
    if (budget() <= 1000) {
      return { ok: false, error: lastError === "All keys failed." ? "Ran out of time." : lastError };
    }

    const secret = await revealKey(key.id);
    if (!secret) {
      await markKeyError(key.id, "Could not decrypt key from vault");
      continue;
    }

    const call = () =>
      key.api_style === "openai"
        ? callOpenAiCompatible(key, secret, prompt, budget())
        : callGemini(key, secret, prompt, budget());

    try {
      let attempt = await call();

      // 5xx is usually "the model is busy" and clears on its own; another key
      // would hit the same busy model, so back off on this one first.
      // Only retry while there is time for the retry and its backoff.
      for (let i = 0; i < 2 && !attempt.ok && attempt.status >= 500; i++) {
        const backoff = 1500 * (i + 1);
        if (deadline - Date.now() < backoff + 2000) break;
        await new Promise((r) => setTimeout(r, backoff));
        attempt = await call();
      }

      if (!attempt.ok) {
        lastError = `${key.provider}: ${attempt.status} ${attempt.detail}`;
        await markKeyError(key.id, lastError);
        // Per-key faults and a still-busy model both justify the next key;
        // anything else is a bad request that another key would hit identically.
        if ([429, 401, 403].includes(attempt.status) || attempt.status >= 500) continue;
        return { ok: false, error: lastError };
      }

      const questions = sanitize(parseQuestions(attempt.text));
      if (!questions.length) {
        lastError = `${key.provider} returned nothing usable.`;
        await markKeyError(key.id, lastError);
        continue;
      }

      await markKeyUsed(key.id);
      return { ok: true, questions, keyLabel: key.label, provider: key.provider };
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Request failed";
      await markKeyError(key.id, lastError);
    }
  }

  return { ok: false, error: lastError };
}
