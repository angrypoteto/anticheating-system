import "server-only";


// Prompt, schema and sanitising shared by every provider. The request itself
// lives in generate.ts, which dispatches on the key's api_style.

export type DraftQuestion = {
  type: "MULTIPLE_CHOICE" | "IDENTIFICATION";
  prompt: string;
  choices?: string[];
  answer: string;
};

export const RESPONSE_SCHEMA = {
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

/** Describes the requested composition the way the proposal frames it. */
export function describeMix(mc: number, ident: number): string {
  const parts: string[] = [];
  if (mc > 0) parts.push(`${mc} multiple-choice`);
  if (ident > 0) parts.push(`${ident} identification`);
  return parts.join(" and ") || "questions";
}

export function buildPrompt(text: string, count: number, mix: string) {
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
    // Gemini is held to a response schema; a plain chat model is not, and will
    // happily name the field "question" instead. Spell the shape out.
    "Reply with a JSON array where each item uses exactly these keys:",
    '  {"type": "MULTIPLE_CHOICE" | "IDENTIFICATION", "prompt": "...", "choices": ["..."], "answer": "..."}',
    'Use the key "prompt" for the question text. Omit "choices" for IDENTIFICATION.',
    "",
    "--- LESSON MATERIAL ---",
    text.slice(0, 120_000),
  ].join("\n");
}

/** First non-empty string among the given keys — models rename fields freely. */
function pickString(q: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = q[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function pickArray(q: Record<string, unknown>, keys: string[]): unknown[] {
  for (const k of keys) {
    if (Array.isArray(q[k])) return q[k] as unknown[];
  }
  return [];
}

/**
 * Discards anything malformed rather than letting a bad item reach the review
 * screen — but accepts the field names models actually use. Groq's gpt-oss
 * returns "question" rather than "prompt", which silently emptied every batch
 * until the aliases were added.
 */
export function sanitize(raw: unknown): DraftQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: DraftQuestion[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const q = item as Record<string, unknown>;
    const rawType = pickString(q, ["type", "question_type", "kind"]).toUpperCase();
    const prompt = pickString(q, ["prompt", "question", "text", "stem"]);
    const answer = pickString(q, ["answer", "correct_answer", "correct", "expected"]);
    const rawChoices = pickArray(q, ["choices", "options", "answers", "alternatives"]);

    // An item with choices is multiple choice whatever it called itself.
    const type: DraftQuestion["type"] =
      rawType.includes("IDENT") || (!rawType && rawChoices.length === 0)
        ? "IDENTIFICATION"
        : rawChoices.length > 0
          ? "MULTIPLE_CHOICE"
          : "IDENTIFICATION";

    if (!prompt || !answer) continue;

    if (type === "MULTIPLE_CHOICE") {
      const choices = rawChoices
        .filter((c): c is string => typeof c === "string" && c.trim() !== "")
        .map((c) => c.trim());
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
