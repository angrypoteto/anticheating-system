import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { assessStudent } from "@/lib/risk";
import { Card, Empty, PageHeader, Pill, Stat } from "./ui";

export const dynamic = "force-dynamic";

const since = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

export default async function AdminOverview() {
  const admin = createAdminClient();
  const day = since(24);

  const [
    { data: settings },
    { data: users },
    { data: sections },
    { data: exams },
    { data: sessions },
    { data: openFlags },
    { data: recent },
    { data: keys },
    { data: backups },
  ] = await Promise.all([
    admin.from("system_settings").select("pass_threshold, institution_name").eq("id", true).maybeSingle(),
    admin.from("users").select("id, email, role, status, section_id"),
    admin.from("sections").select("id, name"),
    admin.from("exams").select("id, section_id, status"),
    admin.from("exam_sessions").select("id, exam_id, student_id, status, score, submitted_at"),
    admin.from("flags").select("id, session_id").is("resolution", null),
    admin.from("audit_log").select("action, actor_id, created_at").order("created_at", { ascending: false }).limit(6),
    admin.from("ai_provider_keys").select("status, last_error"),
    admin.from("backup_runs").select("started_at, status").order("started_at", { ascending: false }).limit(1),
  ]);

  const passThreshold = Number(settings?.pass_threshold ?? 75);
  const students = (users ?? []).filter((u) => u.role === "STUDENT");
  const published = (exams ?? []).filter((e) => e.status === "PUBLISHED");
  const live = (sessions ?? []).filter((s) => s.status === "IN_PROGRESS");
  const submittedToday = (sessions ?? []).filter(
    (s) => s.status !== "IN_PROGRESS" && s.submitted_at && s.submitted_at >= day,
  );

  // Reuse the same indicator the students page shows, so the two never disagree.
  const atRisk = students.filter((s) => {
    const own = (sessions ?? []).filter((x) => x.student_id === s.id);
    const available = published.filter((e) => e.section_id === s.section_id).length;
    const r = assessStudent(
      own.map((o) => ({ score: o.score, status: o.status, flags: 0 })),
      available,
      passThreshold,
    );
    return r.band === "at-risk";
  }).length;

  const notExamined = students.filter(
    (s) => !(sessions ?? []).some((x) => x.student_id === s.id),
  ).length;

  const actorEmail = new Map((users ?? []).map((u) => [u.id, u.email]));
  const activeKeys = (keys ?? []).filter((k) => k.status === "ACTIVE").length;
  const lastBackup = backups?.[0];
  const backupStale =
    !lastBackup || Date.now() - new Date(lastBackup.started_at).getTime() > 48 * 3600_000;

  const alerts: { text: string; href: string }[] = [];
  if (!activeKeys) alerts.push({ text: "No active AI provider key — question generation will fail.", href: "/admin/keys" });
  if (backupStale) alerts.push({ text: "No backup in the last 48 hours.", href: "/admin/health" });
  if (atRisk > 0) alerts.push({ text: `${atRisk} student${atRisk === 1 ? "" : "s"} currently at risk of failing.`, href: "/admin/students" });
  if (notExamined > 0) alerts.push({ text: `${notExamined} student${notExamined === 1 ? " has" : "s have"} not sat any exam.`, href: "/admin/students" });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        subtitle={`${settings?.institution_name ?? "Proctorly"} — everything at a glance.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Students" value={String(students.length)} note={`${sections?.length ?? 0} class${sections?.length === 1 ? "" : "es"}`} />
        <Stat label="Sitting now" value={String(live.length)} tone={live.length ? "warn" : "plain"} />
        <Stat label="Submitted (24h)" value={String(submittedToday.length)} />
        <Stat label="Open flags" value={String((openFlags ?? []).length)} tone={(openFlags ?? []).length ? "warn" : "good"} />
      </div>

      {alerts.length ? (
        <Card title="Needs attention" flush>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {alerts.map((a) => (
              <li key={a.text} className="flex items-center justify-between gap-4 px-6 py-3">
                <span className="text-sm text-gray-700 dark:text-gray-300">{a.text}</span>
                <Link
                  href={a.href}
                  className="shrink-0 text-sm text-teal-700 underline underline-offset-4 dark:text-teal-400"
                >
                  Look
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card title="Needs attention">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Nothing needs your attention right now.
          </p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Exams" hint={`${published.length} published, ${(exams ?? []).length - published.length} draft`}>
          <div className="space-y-2 text-sm">
            <Row k="Published" v={String(published.length)} />
            <Row k="In progress now" v={String(live.length)} />
            <Row k="At risk of failing" v={String(atRisk)} tone={atRisk ? "bad" : "good"} />
            <Row k="Never examined" v={String(notExamined)} tone={notExamined ? "warn" : "good"} />
          </div>
        </Card>

        <Card title="Platform">
          <div className="space-y-2 text-sm">
            <Row k="Active AI keys" v={String(activeKeys)} tone={activeKeys ? "good" : "bad"} />
            <Row
              k="Last backup"
              v={lastBackup ? new Date(lastBackup.started_at).toLocaleDateString() : "never"}
              tone={backupStale ? "warn" : "good"}
            />
            <Row k="Instructors" v={String((users ?? []).filter((u) => u.role === "INSTRUCTOR").length)} />
            <Row k="Disabled accounts" v={String((users ?? []).filter((u) => u.status !== "ACTIVE").length)} />
          </div>
        </Card>
      </div>

      <Card title="Recent activity" hint="Append-only audit log." flush>
        {recent?.length ? (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {recent.map((a, i) => (
              <li key={i} className="flex items-baseline justify-between gap-4 px-6 py-3 text-sm">
                <span className="text-gray-700 dark:text-gray-300">
                  <span className="font-mono text-xs">{a.action}</span>
                  <span className="ml-2 text-gray-500 dark:text-gray-400">
                    {actorEmail.get(a.actor_id) ?? "unknown"}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
                  {new Date(a.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nothing recorded yet.</Empty>
        )}
      </Card>
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-600 dark:text-gray-400">{k}</span>
      {tone ? <Pill tone={tone}>{v}</Pill> : <span className="text-gray-900 dark:text-gray-100">{v}</span>}
    </div>
  );
}
