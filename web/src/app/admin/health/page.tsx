import type { Metadata } from "next";
import { Card, Empty, FactRow, FactValue, PageHeader, Pill, Stat, Stats } from "../ui";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function since(hours: number) {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

const olderThan = (iso: string, hours: number) =>
  Date.now() - new Date(iso).getTime() > hours * 3600_000;

export const metadata: Metadata = { title: "System health" };

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
  const backupStale = !lastBackup || olderThan(lastBackup.started_at, 48);

  return (
    <div className="space-y-5">
      <PageHeader
        title="System health"
        subtitle={`Snapshot at ${new Date().toLocaleString()}`}
      />

      <Stats>
        <Stat label="Sitting now" value={String(liveSessions.count ?? 0)} />
        <Stat label="Submitted in the last day" value={String(submittedToday.count ?? 0)} />
        <Stat label="Flags in the last day" value={String(flagsToday.count ?? 0)} />
        <Stat
          label="Open flags"
          value={String(openFlags.count ?? 0)}
          tone={openFlags.count ? "warn" : "plain"}
        />
      </Stats>

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <Card title="Accounts" flush>
          <FactRow label="Students">
            <Count n={byRole("STUDENT")} />
          </FactRow>
          <FactRow label="Instructors">
            <Count n={byRole("INSTRUCTOR")} />
          </FactRow>
          <FactRow label="Administrators">
            <Count n={byRole("ADMIN")} />
          </FactRow>
          <FactRow label="Disabled">
            <Count n={disabled} warn={disabled > 0} />
          </FactRow>
        </Card>

        <Card title="AI provider keys" flush>
          <FactRow label="Active">
            <Count n={activeKeys} warn={activeKeys === 0} />
          </FactRow>
          <FactRow label="With errors">
            <Count n={keyProblems.length} warn={keyProblems.length > 0} />
          </FactRow>
          {keyProblems.length || activeKeys === 0 ? (
            <div className="space-y-1 border-t border-gray-100 px-5 py-3 text-[12.5px] text-amber-800">
              {keyProblems.map((k) => (
                <p key={k.label}>
                  {k.label}: {k.last_error}
                </p>
              ))}
              {activeKeys === 0 ? (
                <p>Question generation is unavailable until a key is added.</p>
              ) : null}
            </div>
          ) : null}
        </Card>

        <Card title="Backups" flush>
          {lastBackup ? (
            <>
              <FactRow label="Last run">
                {backupStale || lastBackup.status === "FAILED" ? (
                  <Pill tone="warn">{new Date(lastBackup.started_at).toLocaleString()}</Pill>
                ) : (
                  <FactValue>{new Date(lastBackup.started_at).toLocaleString()}</FactValue>
                )}
              </FactRow>
              <FactRow label="Result">
                {lastBackup.status === "FAILED" ? (
                  <Pill tone="bad">Failed</Pill>
                ) : (
                  <FactValue>{sentence(lastBackup.status)}</FactValue>
                )}
              </FactRow>
              {lastBackup.storage_path ? (
                <p className="border-t border-gray-100 px-5 py-3 font-mono text-xs break-all text-gray-500">
                  {lastBackup.storage_path}
                </p>
              ) : null}
            </>
          ) : (
            <p className="p-5 text-sm text-amber-800">
              No backup has been recorded yet. The scheduled workflow needs the
              SUPABASE_DB_URL secret set on the repository before it can run.
            </p>
          )}
        </Card>
      </div>

      <Card
        title="Recent activity"
        hint="Append-only. Nobody, including an administrator, can edit or delete these rows."
        flush
      >
        {recentAudit.data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[13.5px]">
              <thead className="text-[12.5px] text-gray-400">
                <tr className="border-b border-gray-100">
                  <th className="px-5 py-2.5 font-medium">Action</th>
                  <th className="px-3 py-2.5 font-medium">By</th>
                  <th className="px-5 py-2.5 text-right font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {recentAudit.data.map((a) => (
                  <tr key={a.id} className="border-b border-gray-100 last:border-b-0">
                    <td className="px-5 py-2.5 font-mono text-xs text-gray-700">{a.action}</td>
                    <td className="px-3 py-2.5 text-gray-900">
                      {actorName.get(a.actor_id) ?? "Unknown"}
                    </td>
                    <td className="px-5 py-2.5 text-right text-[13px] whitespace-nowrap tabular-nums text-gray-500">
                      {new Date(a.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Nothing recorded yet.</Empty>
        )}
      </Card>
    </div>
  );
}

function Count({ n, warn }: { n: number; warn?: boolean }) {
  return (
    <span className={`font-semibold tabular-nums ${warn ? "text-amber-800" : "text-gray-900"}`}>
      {n}
    </span>
  );
}

/** "SUCCEEDED" reads as "Succeeded". */
function sentence(word: string) {
  return word.charAt(0) + word.slice(1).toLowerCase();
}
