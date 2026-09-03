import "server-only";

import { listActiveKeys, markKeyError, markKeyUsed, revealKey } from "./keys";

// The API's own model listing advertises models that then return
// "404 ... no longer available to new users" (gemini-2.5-flash does this), so a
// floating alias is safer than pinning a version that can be retired underneath us.
const MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export type DraftQuestion = {
  type: "MULTIPLE_CHOICE" | "IDENTIFICATION";
  prompt: string;
  choices?: string[];
  answer: string;
};

const RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      type: { type: "STRING", enum: ["MULTIPLE_CHOICE", "IDENTIFICATION"] },
      prompt: { type: "STRING" },
      choices: { type: "ARRAY", items: { type: "STRING" } },
      answer: { type: "STRING" },
    },
    required: ["type", "prompt", "answer"],
  },
};

function buildPrompt(text: string, count: number, mix: string) {
  return [
    "You are helping a teacher write an exam from their own lesson material.",
    `Write exactly ${count} questions (${mix}) answerable purely from the material below.`,
    "",
    "Rules:",
    "- Every question must be answerable from the material alone; invent nothing.",
    "- MULTIPLE_CHOICE needs 4 plausible choices; `answer` must repeat the correct choice verbatim.",
    "- IDENTIFICATION expects a short answer; `answer` is the expected wording.",
    "- Vary difficulty; avoid near-duplicate questions.",
    "",
    "--- LESSON MATERIAL ---",
    text.slice(0, 120_000),
  ].join("\n");
}

/** Discards anything malformed rather than letting a bad item reach the review screen. */
function sanitize(raw: unknown): DraftQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: DraftQuestion[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const q = item as Record<string, unknown>;
    const type = q.type === "IDENTIFICATION" ? "IDENTIFICATION" : "MULTIPLE_CHOICE";
    const prompt = typeof q.prompt === "string" ? q.prompt.trim() : "";
    const answer = typeof q.answer === "string" ? q.answer.trim() : "";
    if (!prompt || !answer) continue;

    if (type === "MULTIPLE_CHOICE") {
      const choices = Array.isArray(q.choices)
        ? q.choices.filter((c): c is string => typeof c === "string" && c.trim() !== "")
            .map((c) => c.trim())
        : [];
      // The answer must be one of the choices, or the item is ungradable.
      if (choices.length < 2) continue;
      if (!choices.some((c) => c.toLowerCase() === answer.toLowerCase())) continue;
      out.push({ type, prompt, choices: [...new Set(choices)], answer });
    } else {
      out.push({ type, prompt, answer });
    }
  }
  return out;
}

export type GenerateResult =
  | { ok: true; questions: DraftQuestion[]; keyLabel: string }
  | { ok: false; error: string };

/**
 * Tries each active key in turn. Gemini's free tier rate-limits per key, which is
 * the whole reason the admin console holds several: a 429 moves to the next key
 * rather than failing the request.
 */
export async function generateQuestions(
  text: string,
  count: number,
  mix: string,
): Promise<GenerateResult> {
  if (!text.trim()) return { ok: false, error: "The lesson file had no readable text." };

  const keys = await listActiveKeys("gemini");
  if (!keys.length) {
    return { ok: false, error: "No active Gemini keys. Add one in the admin console." };
  }

  const body = {
    contents: [{ parts: [{ text: buildPrompt(text, count, mix) }] }],
    generationConfig: {
      temperature: 0.4,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  };

  let lastError = "All keys failed.";

  for (const key of keys) {
    const secret = await revealKey(key.id);
    if (!secret) {
      await markKeyError(key.id, "Could not decrypt key from vault");
      continue;
    }

    try {
      const res = await fetch(
        `${ENDPOINT}/${MODEL}:generateContent?key=${encodeURIComponent(secret)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(120_000),
        },
      );

      if (!res.ok) {
        const detail = await res.text();
        lastError = `${res.status}: ${detail.slice(0, 200)}`;
        await markKeyError(key.id, lastError);
        // Quota/rate/auth problems are per-key — try the next one. Anything else
        // is a request-level fault that retrying with another key won't fix.
        if ([429, 401, 403].includes(res.status)) continue;
        return { ok: false, error: lastError };
      }

      const json = await res.json();
      const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof raw !== "string") {
        lastError = "Model returned no content.";
        await markKeyError(key.id, lastError);
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        lastError = "Model returned unparseable JSON.";
        await markKeyError(key.id, lastError);
        continue;
      }

      const questions = sanitize(parsed);
      if (!questions.length) {
        lastError = "No usable questions came back — try a longer lesson file.";
        await markKeyError(key.id, lastError);
        continue;
      }

      await markKeyUsed(key.id);
      return { ok: true, questions, keyLabel: key.label };
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Request failed";
      await markKeyError(key.id, lastError);
    }
  }

  return { ok: false, error: lastError };
}
