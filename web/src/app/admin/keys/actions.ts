"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { auditServerAction } from "@/lib/audit";
import { presetFor } from "@/lib/ai/providers";

export type KeyState = { error?: string; success?: string };

export async function addKey(
  _prev: KeyState,
  formData: FormData,
): Promise<KeyState> {
  const admin = await requireRole("ADMIN");

  const presetId = String(formData.get("preset") ?? "gemini").trim();
  const preset = presetFor(presetId);
  // "Other" lets an admin name a provider we have no preset for.
  const provider =
    presetId === "custom"
      ? String(formData.get("customName") ?? "").trim().toLowerCase()
      : presetId;
  const apiStyle = preset?.apiStyle ?? "openai";
  const baseUrl = String(formData.get("baseUrl") ?? "").trim() || preset?.baseUrl || "";
  const model = String(formData.get("model") ?? "").trim() || preset?.defaultModel || "";
  const label = String(formData.get("label") ?? "").trim();
  const secret = String(formData.get("secret") ?? "").trim();

  if (!provider) return { error: "Name the provider." };
  if (!label) return { error: "Give the key a label so you can tell them apart." };
  if (secret.length < 8) return { error: "That doesn't look like a valid key." };
  if (apiStyle === "openai" && !baseUrl) {
    return { error: "An OpenAI-compatible provider needs a base URL." };
  }
  if (apiStyle === "openai" && !model) {
    return { error: "Name the model to use for this provider." };
  }

  // ai_key_store writes the secret into Supabase Vault and keeps only a pointer
  // plus the last four characters on the row.
  const client = createAdminClient();
  const { data: keyId, error } = await client.rpc("ai_key_store", {
    p_provider: provider,
    p_label: label,
    p_secret: secret,
    p_added_by: admin.id,
    p_api_style: apiStyle,
    p_base_url: baseUrl || null,
    p_model: model || null,
  });

  if (error) return { error: error.message };

  // The key material itself never enters the log — only that one was added.
  await auditServerAction(admin.id, "add_ai_key", "ai_provider_keys", String(keyId), {
    provider,
    label,
    api_style: apiStyle,
  });

  revalidatePath("/admin/keys");
  return { success: `Added “${label}”. The key itself is now write-only.` };
}

export async function setKeyStatus(
  _prev: KeyState,
  formData: FormData,
): Promise<KeyState> {
  const actor = await requireRole("ADMIN");
  const keyId = String(formData.get("keyId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (status !== "ACTIVE" && status !== "DISABLED") return { error: "Invalid status." };

  const client = createAdminClient();
  const { error } = await client
    .from("ai_provider_keys")
    .update({ status, last_error: null })
    .eq("id", keyId);
  if (error) return { error: error.message };

  await auditServerAction(actor.id, "set_ai_key_status", "ai_provider_keys", keyId, { status });

  revalidatePath("/admin/keys");
  return { success: `Key ${status.toLowerCase()}.` };
}

export async function deleteKey(
  _prev: KeyState,
  formData: FormData,
): Promise<KeyState> {
  const actor = await requireRole("ADMIN");
  const keyId = String(formData.get("keyId") ?? "");

  const client = createAdminClient();
  const { error } = await client.rpc("ai_key_delete", { p_key_id: keyId });
  if (error) return { error: error.message };

  await auditServerAction(actor.id, "delete_ai_key", "ai_provider_keys", keyId);

  revalidatePath("/admin/keys");
  return { success: "Key deleted from the vault." };
}

/** Confirms a key still authenticates, without ever returning it to the browser. */
export async function testKey(
  _prev: KeyState,
  formData: FormData,
): Promise<KeyState> {
  await requireRole("ADMIN");
  const keyId = String(formData.get("keyId") ?? "");

  const client = createAdminClient();
  const { data: key } = await client
    .from("ai_provider_keys")
    .select("api_style, base_url")
    .eq("id", keyId)
    .maybeSingle();
  const { data: secret, error } = await client.rpc("ai_key_reveal", { p_key_id: keyId });
  if (error || typeof secret !== "string") return { error: "Could not read that key." };

  try {
    // Each style has a cheap endpoint that proves the credential without
    // spending a generation.
    const res =
      key?.api_style === "openai"
        ? await fetch(`${(key.base_url ?? "").replace(/\/+$/, "")}/models`, {
            headers: { Authorization: `Bearer ${secret}` },
            signal: AbortSignal.timeout(20_000),
          })
        : await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(secret)}`,
            { signal: AbortSignal.timeout(20_000) },
          );
    const ok = res.ok;
    const detail = ok ? null : (await res.text()).slice(0, 200);

    await client
      .from("ai_provider_keys")
      .update({ last_error: ok ? null : `${res.status}: ${detail}` })
      .eq("id", keyId);

    revalidatePath("/admin/keys");
    return ok
      ? { success: "Key works." }
      : { error: `Provider rejected the key (${res.status}).` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Test failed." };
  }
}
