"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { pingModel } from "@/lib/ai/generate";
import { auditServerAction } from "@/lib/audit";
import { nextKeyLabel, presetFor } from "@/lib/ai/providers";

export type KeyState = { error?: string; success?: string };

/** What one key did when asked, and how much it matters. */
export type KeyVerdict = {
  id: string;
  label: string;
  provider: string;
  ok: boolean;
  tone: "good" | "warn" | "bad";
  say: string;
};

export type TestAllState = {
  error?: string;
  /** Absent until a run has happened. */
  verdicts?: KeyVerdict[];
  checkedAt?: string;
};

/**
 * What a ping means, in words.
 *
 * The distinction that matters is not working/broken — it is "replace this"
 * versus "wait". A spent allowance and a rejected credential both stop
 * generation today, and only one of them is worth an admin's afternoon.
 */
function readPing(
  provider: string,
  result: { ok: boolean; status: number; detail: string },
): { ok: boolean; tone: "good" | "warn" | "bad"; say: string } {
  if (result.ok) return { ok: true, tone: "good", say: "Answered." };
  if (result.status === 401 || result.status === 403) {
    return { ok: false, tone: "bad", say: `Rejected (${result.status}). Replace it.` };
  }
  if (result.status === 429) {
    return { ok: false, tone: "warn", say: "Out of quota for now — the key is valid, the allowance is spent." };
  }
  if (result.status >= 500) {
    return {
      ok: false,
      tone: "warn",
      say: `Valid, but ${provider} is not answering (${result.status}). Their capacity, not your key.`,
    };
  }
  return { ok: false, tone: "bad", say: `Refused (${result.status}). ${result.detail.slice(0, 100)}` };
}

/** Ping one stored key and record what came back. Shared by both tests. */
async function pingStoredKey(
  client: ReturnType<typeof createAdminClient>,
  key: { id: string; provider: string; label: string; api_style: string; base_url: string | null; model: string | null },
): Promise<{ ok: boolean; tone: "good" | "warn" | "bad"; say: string }> {
  const { data: secret, error } = await client.rpc("ai_key_reveal", { p_key_id: key.id });
  if (error || typeof secret !== "string") {
    return { ok: false, tone: "bad", say: "Could not read that key from the vault." };
  }

  let read: { ok: boolean; tone: "good" | "warn" | "bad"; say: string };
  try {
    const result = await pingModel(key as Parameters<typeof pingModel>[0], secret);
    read = readPing(key.provider, result);
    await client
      .from("ai_provider_keys")
      .update({
        last_error: result.ok
          ? null
          : `${key.provider}: ${result.status} ${result.detail}`.slice(0, 500),
      })
      .eq("id", key.id);
  } catch (e) {
    read = { ok: false, tone: "bad", say: e instanceof Error ? e.message : "Test failed." };
    await client
      .from("ai_provider_keys")
      .update({ last_error: read.say.slice(0, 500) })
      .eq("id", key.id);
  }
  return read;
}

/**
 * Ask every stored key to answer, and report what each one said.
 *
 * Testing them one at a time meant an admin with six keys pressed six buttons
 * and held six answers in their head to work out whether generation would run
 * at all — which is the only question they were asking. They go out together,
 * a few at a time so the providers are not hammered, and come back as one
 * list.
 */
export async function testAllKeys(
  _prev: TestAllState,
  _formData: FormData,
): Promise<TestAllState> {
  const actor = await requireRole("ADMIN");

  const client = createAdminClient();
  const { data: keys } = await client
    .from("ai_provider_keys")
    .select("id, provider, label, api_style, base_url, model")
    .order("created_at", { ascending: true });

  if (!keys?.length) return { error: "There are no keys to test." };

  // A small pool: enough to finish quickly, not enough to look like an attack
  // to a provider already rate-limiting us.
  const AT_ONCE = 4;
  const verdicts: KeyVerdict[] = new Array(keys.length);
  let next = 0;

  await Promise.all(
    Array.from({ length: Math.min(AT_ONCE, keys.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= keys.length) return;
        const key = keys[i]!;
        const read = await pingStoredKey(client, key);
        verdicts[i] = {
          id: key.id,
          label: key.label,
          provider: key.provider,
          ok: read.ok,
          tone: read.tone,
          say: read.say,
        };
      }
    }),
  );

  await auditServerAction(actor.id, "test_all_ai_keys", "ai_provider_keys", "all", {
    tested: verdicts.length,
    answered: verdicts.filter((v) => v.ok).length,
  });

  revalidatePath("/admin/keys");
  return { verdicts, checkedAt: new Date().toISOString() };
}

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
  const secret = String(formData.get("secret") ?? "").trim();

  if (!provider) return { error: "Name the provider." };
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

  // Named rather than asked for. Every key of this provider is read, including
  // disabled ones, so a number is never reused while the row that had it is
  // still there to be confused with.
  const { data: siblings } = await client
    .from("ai_provider_keys")
    .select("label")
    .eq("provider", provider);
  const label = nextKeyLabel(
    provider,
    (siblings ?? []).map((k: { label: string }) => k.label),
  );
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
    .select("id, provider, label, api_style, base_url, model")
    .eq("id", keyId)
    .maybeSingle();
  if (!key) return { error: "That key is gone." };

  // Ask the generation endpoint itself. Testing the provider's model listing
  // proved only that the credential was valid — it answered happily while
  // generateContent returned 503, so the console showed "Key works" over a
  // key that could not generate anything.
  const read = await pingStoredKey(client, key);
  revalidatePath("/admin/keys");
  return read.ok ? { success: "Key works — the model answered." } : { error: read.say };
}
