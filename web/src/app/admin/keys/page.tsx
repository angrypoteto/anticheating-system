import { PageHeader } from "../ui";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AddKeyForm, KeyRow } from "./forms";

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

        <section className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-medium text-slate-900 dark:text-slate-50">
            Add a key
          </h2>
          <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
            Stored encrypted in Supabase Vault. It is never shown again after saving
            and never reaches the browser — only the last four characters are kept
            for identification.
          </p>
          <AddKeyForm />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 p-6 dark:border-slate-800">
            <h2 className="text-lg font-medium text-slate-900 dark:text-slate-50">
              Stored keys
            </h2>
          </div>
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
            <p className="p-6 text-sm text-slate-500 dark:text-slate-400">
              No keys stored yet.
            </p>
          )}
        </section>
    </div>
  );
}
