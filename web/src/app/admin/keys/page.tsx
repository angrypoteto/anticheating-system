import type { Metadata } from "next";
import { PageHeader } from "../ui";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AddKeyForm, KeyRow, LiveKeyCheck } from "./forms";

export const metadata: Metadata = { title: "AI provider keys" };

export default async function KeysPage() {
  await requireRole("ADMIN");

  // Read with the service role: ai_provider_keys is admin-readable under RLS, but
  // the vault pointer and hint are only ever assembled server-side.
  const client = createAdminClient();
  const { data: keys } = await client
    .from("ai_provider_keys")
    .select("id, provider, label, key_hint, status, last_used_at, last_error")
    .order("created_at", { ascending: true });

  const activeCount = (keys ?? []).filter((k) => k.status === "ACTIVE").length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="AI provider keys"
        subtitle={`${activeCount} active. Generation tries each active key in turn, moving to the next when one is rate-limited — which is why it is worth adding several.`}
      />

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-[15px] font-semibold text-gray-900">
            Add a key
          </h2>
          <p className="mt-1 mb-4 text-sm text-gray-500 dark:text-gray-400">
            Stored encrypted in Supabase Vault. It is never shown again after saving
            and never reaches the browser — only the last four characters are kept
            for identification.
          </p>
          <AddKeyForm />
        </section>

        <section className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-[15px] font-semibold text-gray-900">
              Stored keys
            </h2>
            <p className="mt-1 max-w-[62ch] text-sm text-gray-500">
              Generation needs one of these to answer. Testing asks each one to
              write a single word, which is the same thing generation does — so
              a key that passes here is a key that will work.
            </p>
          </div>

          {/* Its own strip rather than a corner of the header: the result is a
              list as long as the key list, and it needs the width. */}
          {keys?.length ? (
            <div className="border-b border-gray-200 bg-gray-50/60 p-6 dark:border-gray-800">
              <LiveKeyCheck count={keys.length} />
            </div>
          ) : null}
          {keys?.length ? (
            <ul>
              {keys.map((k) => (
                <KeyRow
                  key={k.id}
                  id={k.id}
                  label={k.label}
                  provider={k.provider}
                  hint={k.key_hint}
                  status={k.status}
                  lastUsed={k.last_used_at}
                  lastError={k.last_error}
                />
              ))}
            </ul>
          ) : (
            <p className="p-6 text-sm text-gray-500 dark:text-gray-400">
              No keys stored yet.
            </p>
          )}
        </section>
    </div>
  );
}
