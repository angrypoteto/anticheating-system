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
  apiStyle: ApiStyle;
  baseUrl?: string;
  defaultModel: string;
  hint?: string;
};

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    apiStyle: "gemini",
    defaultModel: "gemini-flash-latest",
    hint: "Uses Google's own API. Free tier available.",
  },
  {
    id: "groq",
    label: "Groq",
    apiStyle: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    hint: "Very fast, generous free tier.",
  },
  {
    id: "openai",
    label: "OpenAI",
    apiStyle: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    apiStyle: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "meta-llama/llama-3.3-70b-instruct",
    hint: "One key, many models.",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    apiStyle: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
  },
  {
    id: "custom",
    label: "Other (enter your own)",
    apiStyle: "openai",
    defaultModel: "",
    hint: "Anything that speaks the OpenAI chat-completions API.",
  },
];

export const presetFor = (id: string) => PROVIDER_PRESETS.find((p) => p.id === id);
