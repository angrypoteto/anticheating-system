import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { classesEnabled } from "@/lib/settings";
import { classLabel } from "@/lib/classes";
import { loadEnrolment } from "@/lib/enrolment";
import { Card, Empty, PageHeader } from "@/app/admin/ui";

export const dynamic = "force-dynamic";

/** The classes this teacher holds, with the join code to hand out. */
export default async function TeacherClassesPage() {
  await requireRole("INSTRUCTOR", "ADMIN");
  if (!(await classesEnabled())) redirect("/teacher");

  const supabase = await createClient();
  const [{ data: sections }, { data: students }, enrolment] = await Promise.all([
    supabase.from("sections").select("id, name, subject, join_code").order("subject").order("name"),
    supabase.from("users").select("id, email, full_name").eq("role", "STUDENT"),
    loadEnrolment(supabase),
  ]);

  const byId = new Map((students ?? []).map((s) => [s.id, s]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="My classes"
        subtitle="Each subject has its own code. Give it to your students and they join themselves — or an admin can enrol them for you."
      />

      {sections?.length ? (
        sections.map((s) => {
          const roll = (enrolment.rollOf.get(s.id) ?? [])
            .map((id) => byId.get(id))
            .filter(Boolean);
          return (
            <Card
              key={s.id}
              title={classLabel(s)}
              hint={`${roll.length} student${roll.length === 1 ? "" : "s"}`}
              flush
            >
              <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-6 py-4 dark:border-gray-800">
                <span className="text-sm text-gray-600 dark:text-gray-400">Class code</span>
                <code className="font-mono text-base tracking-[0.2em] text-teal-700 dark:text-teal-400">
                  {s.join_code}
                </code>
              </div>
              {roll.length ? (
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {roll.map((r) => (
                    <li key={r!.id} className="px-6 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {r!.full_name || r!.email}
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>Nobody has joined yet. Share the code above.</Empty>
              )}
            </Card>
          );
        })
      ) : (
        <Card>
          <Empty>
            You do not hold any classes yet. An administrator assigns them from Accounts &
            classes.
          </Empty>
        </Card>
      )}
    </div>
  );
}
