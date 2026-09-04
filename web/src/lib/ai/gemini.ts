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
    "--- LESSON MATERIAL ---",
    text.slice(0, 120_000),
  ].join("\n");
}

/** Discards anything malformed rather than letting a bad item reach the review screen. */
export function sanitize(raw: unknown): DraftQuestion[] {
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
