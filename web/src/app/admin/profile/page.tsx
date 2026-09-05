import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { Card, PageHeader, Pill } from "../ui";
import { ProfileForm } from "./form";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const me = await getCurrentUser();
  const admin = createAdminClient();

  const { data: authUser } = await admin.auth.admin.getUserById(me!.id);
  const { data: recent } = await admin
    .from("audit_log")
    .select("action, target_type, created_at")
    .eq("actor_id", me!.id)
    .order("created_at", { ascending: false })
    .limit(10);
  const { count: totalActions } = await admin
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", me!.id);

  const { data: profile } = await admin
    .from("users")
    .select("full_name, username")
    .eq("id", me!.id)
    .maybeSingle();

  const rows: [string, React.ReactNode][] = [
    ["Name", profile?.full_name || "—"],
    ["Username", profile?.username ? `@${profile.username}` : "—"],
    ["Email", me!.email],
    ["Role", <Pill key="r" tone="good">{String(me!.role).toLowerCase()}</Pill>],
    ["Status", String(me!.status ?? "ACTIVE").toLowerCase()],
    ["Account created", authUser?.user?.created_at ? new Date(authUser.user.created_at).toLocaleString() : "—"],
    ["Last sign-in", authUser?.user?.last_sign_in_at ? new Date(authUser.user.last_sign_in_at).toLocaleString() : "—"],
    ["Recorded actions", String(totalActions ?? 0)],
  ];

  return (
    <div className="space-y-8">
      <PageHeader title="My profile" subtitle="Your account and what you have done in the system." />

      <Card title="Your details" hint="Shown around the system instead of your email address.">
        <ProfileForm
          fullName={profile?.full_name ?? ""}
          username={profile?.username ?? ""}
        />
      </Card>

      <Card title="Account">
        <dl className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-2.5">
              <dt className="text-sm text-slate-500 dark:text-slate-400">{k}</dt>
              <dd className="text-sm text-slate-900 dark:text-slate-100">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card
        title="Your recent activity"
        hint="From the append-only audit log — you cannot edit or delete these entries."
        flush
      >
        {recent?.length ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {recent.map((a, i) => (
              <li key={i} className="flex items-baseline justify-between gap-4 px-6 py-3 text-sm">
                <span className="font-mono text-xs text-slate-700 dark:text-slate-300">{a.action}</span>
                <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                  {new Date(a.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-6 text-sm text-slate-500 dark:text-slate-400">Nothing recorded yet.</p>
        )}
      </Card>

      <Card title="Password">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Passwords are managed by Supabase Auth. To change yours, use the reset
          flow from the sign-in page, or have another administrator issue a new
          one.
        </p>
      </Card>
    </div>
  );
}
