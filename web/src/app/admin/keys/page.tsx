import Link from "next/link";
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
    <main className="min-h-screen bg-gray-50 p-8 dark:bg-gray-950">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="border-b border-gray-200 pb-4 dark:border-gray-800">
          <Link
            href="/admin"
            className="text-sm text-gray-500 underline underline-offset-4 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            ← Admin console
          </Link>
          <h1 className="mt-3 text-2xl font-semibold text-gray-900 dark:text-gray-50">
            AI provider keys
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {activeCount} active. Generation tries each active key in turn, moving to
            the next when one is rate-limited — which is why it is worth adding
            several.
          </p>
        </header>

        <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-50">
            Add a key
          </h2>
          <p className="mt-1 mb-4 text-sm text-gray-500 dark:text-gray-400">
            Stored encrypted in Supabase Vault. It is never shown again after saving
            and never reaches the browser — only the last four characters are kept
            for identification.
          </p>
          <AddKeyForm />
        </section>

        <section className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 p-6 dark:border-gray-800">
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-50">
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
            <p className="p-6 text-sm text-gray-500 dark:text-gray-400">
              No keys stored yet.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
