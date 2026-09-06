/**
 * Known providers, and the shape of a custom one.
 *
 * Two API styles cover the field: Google's own `generateContent`, and the
 * OpenAI chat-completions shape that Groq, OpenAI, OpenRouter, DeepSeek and
 * Together all speak. Anything else can be added by hand as long as it speaks
 * one of those two.
 */
export type ApiStyle = "gemini" | "openai";

export type ProviderPreset = {
  id: string;
  label: string;
  /** What one of its keys is called: "Groq key 2". */
  shortLabel: string;
  apiStyle: ApiStyle;
  baseUrl?: string;
  defaultModel: string;
  hint?: string;
};

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    shortLabel: "Gemini",
    apiStyle: "gemini",
    defaultModel: "gemini-flash-latest",
    hint: "Uses Google's own API. Free tier available.",
  },
  {
    id: "groq",
    label: "Groq",
    shortLabel: "Groq",
    apiStyle: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    // Groq has retired the Llama line; llama-3.3-70b-versatile 404s. Checked
    // against their live /models list rather than taken from memory.
    defaultModel: "openai/gpt-oss-120b",
    hint: "Very fast, generous free tier.",
  },
  {
    id: "openai",
    label: "OpenAI",
    shortLabel: "OpenAI",
    apiStyle: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    shortLabel: "OpenRouter",
    apiStyle: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "meta-llama/llama-3.3-70b-instruct",
    hint: "One key, many models.",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    shortLabel: "DeepSeek",
    apiStyle: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
  },
  {
    id: "custom",
    label: "Other (enter your own)",
    shortLabel: "Key",
    apiStyle: "openai",
    defaultModel: "",
    hint: "Anything that speaks the OpenAI chat-completions API.",
  },
];

export const presetFor = (id: string) => PROVIDER_PRESETS.find((p) => p.id === id);

/**
 * The next free name for a key of this provider — "Groq key 2".
 *
 * Asking an admin to think of a label got an email address typed into a field
 * that is then shown beside every exam the key generates. Telling one key from
 * another is all the label ever had to do.
 *
 * Numbered from the highest already taken rather than from how many there are,
 * so deleting key 2 of three does not hand its name to the next one added and
 * leave two different keys sharing a name in the audit log.
 */
export function nextKeyLabel(provider: string, existing: string[]): string {
  const preset = presetFor(provider);
  const name =
    preset && provider !== "custom"
      ? preset.shortLabel
      : provider.charAt(0).toUpperCase() + provider.slice(1);

  const prefix = `${name.toLowerCase()} key `;

  // A label that *starts* "Gemini key 1" reserves 1, whatever it says after it.
  // Requiring an exact match missed "Gemini key 1 (from chat — rotate me)" and
  // handed the number straight back out, so the console ended up showing two
  // keys both called Gemini key 1 — which is precisely what a label is for
  // preventing.
  const highest = existing.reduce((n, label) => {
    const seen = label.trim().toLowerCase();
    if (!seen.startsWith(prefix)) return n;
    const digits = seen.slice(prefix.length).match(/^\d+/);
    return digits ? Math.max(n, Number(digits[0])) : n;
  }, 0);

  // Counting from the highest is still not quite enough on its own: a name
  // already in use verbatim must never be handed out a second time, however it
  // came to be there.
  const taken = new Set(existing.map((l) => l.trim().toLowerCase()));
  let next = highest + 1;
  while (taken.has(`${prefix}${next}`)) next += 1;

  return `${name} key ${next}`;
}
