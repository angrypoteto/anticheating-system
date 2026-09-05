import { PageHeader } from "../ui";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function since(hours: number) {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

export default async function HealthPage() {
  await requireRole("ADMIN");
  const admin = createAdminClient();

  const day = since(24);

  const [
    liveSessions,
    submittedToday,
    flagsToday,
    openFlags,
    accounts,
    keys,
    backups,
    recentAudit,
  ] = await Promise.all([
    admin.from("exam_sessions").select("id", { count: "exact", head: true }).eq("status", "IN_PROGRESS"),
    admin.from("exam_sessions").select("id", { count: "exact", head: true }).neq("status", "IN_PROGRESS").gte("submitted_at", day),
    admin.from("flags").select("id", { count: "exact", head: true }).gte("occurred_at", day),
    admin.from("flags").select("id", { count: "exact", head: true }).is("resolution", null),
    admin.from("users").select("role, status"),
    admin.from("ai_provider_keys").select("label, status, last_error"),
    admin.from("backup_runs").select("started_at, finished_at, status, storage_path").order("started_at", { ascending: false }).limit(5),
    admin.from("audit_log").select("id, action, target_type, created_at, actor_id, metadata").order("created_at", { ascending: false }).limit(25),
  ]);

  const actorIds = [...new Set((recentAudit.data ?? []).map((a) => a.actor_id))];
  const { data: actors } = actorIds.length
    ? await admin.from("users").select("id, email").in("id", actorIds)
    : { data: [] };
  const actorName = new Map((actors ?? []).map((a) => [a.id, a.email]));

  const byRole = (role: string) =>
    (accounts.data ?? []).filter((u) => u.role === role).length;
  const disabled = (accounts.data ?? []).filter((u) => u.status !== "ACTIVE").length;

  const keyProblems = (keys.data ?? []).filter((k) => k.last_error);
  const activeKeys = (keys.data ?? []).filter((k) => k.status === "ACTIVE").length;

  const lastBackup = backups.data?.[0];
  const backupStale =
    !lastBackup ||
    Date.now() - new Date(lastBackup.started_at).getTime() > 48 * 3600_000;

  return (
    <div className="space-y-8">
      <PageHeader
        title="System health"
        subtitle={`Snapshot at ${new Date().toLocaleString()}`}
      />

        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="Live exams" value={String(liveSessions.count ?? 0)} />
          <Stat label="Submitted (24h)" value={String(submittedToday.count ?? 0)} />
          <Stat label="Flags (24h)" value={String(flagsToday.count ?? 0)} />
          <Stat label="Open flags" value={String(openFlags.count ?? 0)} />
        </div>

        <section className="grid gap-4 sm:grid-cols-2">
          <Panel title="Accounts">
            <Row k="Students" v={String(byRole("STUDENT"))} />
            <Row k="Instructors" v={String(byRole("INSTRUCTOR"))} />
            <Row k="Admins" v={String(byRole("ADMIN"))} />
            <Row k="Disabled" v={String(disabled)} warn={disabled > 0} />
          </Panel>

          <Panel title="AI provider keys">
            <Row k="Active" v={String(activeKeys)} warn={activeKeys === 0} />
            <Row k="With errors" v={String(keyProblems.length)} warn={keyProblems.length > 0} />
            {keyProblems.map((k) => (
              <p key={k.label} className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                {k.label}: {k.last_error}
              </p>
            ))}
            {activeKeys === 0 ? (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                Question generation is unavailable until a key is added.
              </p>
            ) : null}
          </Panel>
        </section>

        <Panel title="Backups">
          {lastBackup ? (
            <>
              <Row
                k="Last run"
                v={`${new Date(lastBackup.started_at).toLocaleString()} · ${lastBackup.status.toLowerCase()}`}
                warn={backupStale || lastBackup.status === "FAILED"}
              />
              {lastBackup.storage_path ? (
                <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                  {lastBackup.storage_path}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              No backup has been recorded yet. The scheduled workflow needs the
              SUPABASE_DB_URL secret set on the repository before it can run.
            </p>
          )}
        </Panel>

        <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 p-6 dark:border-slate-800">
            <h2 className="text-lg font-medium text-slate-900 dark:text-slate-50">
              Recent activity
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Append-only. Nobody, including an administrator, can edit or delete
              these rows.
            </p>
          </div>
          {recentAudit.data?.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentAudit.data.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-4 px-6 py-3 text-sm">
                  <span className="text-slate-900 dark:text-slate-100">
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                      {a.action}
                    </span>{" "}
                    · {actorName.get(a.actor_id) ?? "unknown"}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-6 text-sm text-slate-500 dark:text-slate-400">
              Nothing recorded yet.
            </p>
          )}
        </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-50">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-lg font-medium text-slate-900 dark:text-slate-50">{title}</h2>
      {children}
    </div>
  );
}

function Row({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-slate-600 dark:text-slate-400">{k}</span>
      <span className={warn ? "font-medium text-amber-700 dark:text-amber-400" : "text-slate-900 dark:text-slate-100"}>
        {v}
      </span>
    </div>
  );
}
