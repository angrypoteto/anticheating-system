import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Pill } from "@/app/admin/ui";
import { ProfileForm } from "@/app/admin/profile/form";

export const dynamic = "force-dynamic";

/** Your own details. The form writes through your session, not the service role. */
export default async function TeacherProfilePage() {
  const me = await requireRole("INSTRUCTOR", "ADMIN");
  const supabase = await createClient();

  const [{ data: profile }, { count: examCount }] = await Promise.all([
    supabase.from("users").select("full_name, username").eq("id", me.id).maybeSingle(),
    supabase.from("exams").select("id", { count: "exact", head: true }),
  ]);

  const rows: [string, React.ReactNode][] = [
    ["Name", profile?.full_name || "—"],
    ["Username", profile?.username ? `@${profile.username}` : "—"],
    ["Email", me.email],
    ["Role", <Pill key="r" tone="good">{String(me.role).toLowerCase()}</Pill>],
    ["Exams you can manage", String(examCount ?? 0)],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="My profile"
        subtitle="Your name is what students see against the exams you set, so it is worth filling in."
      />

      <Card title="Your details" hint="Only your name and username can be changed here — the database enforces that, not just this form.">
        <ProfileForm fullName={profile?.full_name ?? ""} username={profile?.username ?? ""} />
      </Card>

      <Card title="Account" flush>
        <dl className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 px-6 py-3">
              <dt className="text-sm text-slate-600 dark:text-slate-400">{k}</dt>
              <dd className="text-sm text-slate-900 dark:text-slate-100">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
