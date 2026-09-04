import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type KeyRow = {
  id: string;
  provider: string;
  label: string;
  key_hint: string;
  status: string;
  last_used_at: string | null;
  last_error: string | null;
  api_style: "gemini" | "openai";
  base_url: string | null;
  model: string | null;
};

/**
 * Every active key, least-recently-used first so load spreads evenly. Providers
 * are no longer filtered: whichever keys an admin has configured are tried in
 * turn, so a Groq key can cover for a rate-limited Gemini one.
 */
export async function listActiveKeys(provider?: string): Promise<KeyRow[]> {
  const admin = createAdminClient();
  let q = admin
    .from("ai_provider_keys")
    .select("id, provider, label, key_hint, status, last_used_at, last_error, api_style, base_url, model")
    .eq("status", "ACTIVE");
  if (provider) q = q.eq("provider", provider);
  const { data } = await q.order("last_used_at", { ascending: true, nullsFirst: true });
  return (data ?? []) as KeyRow[];
}

/** Plaintext key, decrypted from Vault. Never send this to a client. */
export async function revealKey(keyId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("ai_key_reveal", { p_key_id: keyId });
  if (error) return null;
  return (data as string) ?? null;
}

export async function markKeyUsed(keyId: string) {
  const admin = createAdminClient();
  await admin
    .from("ai_provider_keys")
    .update({ last_used_at: new Date().toISOString(), last_error: null })
    .eq("id", keyId);
}

export async function markKeyError(keyId: string, message: string) {
  const admin = createAdminClient();
  await admin
    .from("ai_provider_keys")
    .update({ last_used_at: new Date().toISOString(), last_error: message.slice(0, 300) })
    .eq("id", keyId);
}
