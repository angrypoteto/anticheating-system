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
  const highest = existing.reduce((n, label) => {
    const seen = label.trim().toLowerCase();
    if (!seen.startsWith(prefix)) return n;
    const tail = seen.slice(prefix.length);
    return /^\d+$/.test(tail) ? Math.max(n, Number(tail)) : n;
  }, 0);

  return `${name} key ${highest + 1}`;
}
