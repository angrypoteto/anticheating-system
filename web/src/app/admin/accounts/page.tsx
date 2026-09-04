import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { CreateAccountForm, CreateSectionForm, StatusToggle } from "../forms";
import { Card, PageHeader } from "../ui";
import { Tabs } from "./tabs";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const admin = await getCurrentUser();
  const supabase = await createClient();

  const [{ data: users }, { data: sections }] = await Promise.all([
    supabase
      .from("users")
      .select("id, email, role, status, section_id")
      .order("role")
      .order("email"),
    supabase.from("sections").select("id, name, instructor_id, join_code").order("name"),
  ]);

  const sectionName = new Map((sections ?? []).map((s) => [s.id, s.name]));
  const instructors = (users ?? []).filter((u) => u.role === "INSTRUCTOR");
  const studentsPerSection = new Map<string, number>();
  for (const u of users ?? []) {
    if (u.role === "STUDENT" && u.section_id) {
      studentsPerSection.set(u.section_id, (studentsPerSection.get(u.section_id) ?? 0) + 1);
    }
  }

  const accountsPanel = (
    <div className="space-y-6">
      <Card title="Create account" hint="Confirmed immediately — share the temporary password directly with the person.">
        <CreateAccountForm sections={sections ?? []} />
      </Card>

      <Card title="All accounts" hint={`${users?.length ?? 0} total`} flush>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
              <tr>
                <th className="px-6 py-3 font-medium">Email</th>
                <th className="px-6 py-3 font-medium">Role</th>
                <th className="px-6 py-3 font-medium">Class</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((u) => (
                <tr key={u.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                  <td className="px-6 py-3 text-gray-900 dark:text-gray-100">{u.email}</td>
                  <td className="px-6 py-3 text-gray-600 dark:text-gray-400">{u.role.toLowerCase()}</td>
                  <td className="px-6 py-3 text-gray-600 dark:text-gray-400">
                    {u.section_id ? (sectionName.get(u.section_id) ?? "—") : "—"}
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={
                        u.status === "ACTIVE"
                          ? "text-green-700 dark:text-green-400"
                          : "text-gray-400 dark:text-gray-500"
                      }
                    >
                      {u.status.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    {u.id === admin?.id ? (
                      <span className="text-xs text-gray-400 dark:text-gray-600">you</span>
                    ) : (
                      <StatusToggle userId={u.id} status={u.status} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );

  const classesPanel = (
    <div className="space-y-6">
      <Card title="Create class" hint="A class belongs to one instructor — and an instructor can hold as many classes as they teach.">
        <CreateSectionForm instructors={instructors} />
      </Card>

      <Card title="Classes" hint={`${sections?.length ?? 0} total`} flush>
        {sections?.length ? (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {sections.map((s) => {
              const owner = (users ?? []).find((u) => u.id === s.instructor_id);
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{s.name}</p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {owner?.email ?? "no instructor"} · {studentsPerSection.get(s.id) ?? 0} student
                      {(studentsPerSection.get(s.id) ?? 0) === 1 ? "" : "s"}
                    </p>
                  </div>
                  <code className="font-mono text-sm tracking-widest text-teal-700 dark:text-teal-400">
                    {s.join_code}
                  </code>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">No classes yet.</p>
        )}
      </Card>
    </div>
  );

  const codesPanel = (
    <Card
      title="Class codes"
      hint="Students self-register at /signup with these. They always land as students — the database enforces it, not just the form."
    >
      {sections?.length ? (
        <ul className="space-y-2">
          {sections.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-md border border-gray-200 px-4 py-3 dark:border-gray-700"
            >
              <div>
                <span className="text-sm text-gray-900 dark:text-gray-100">{s.name}</span>
                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                  {studentsPerSection.get(s.id) ?? 0} joined
                </span>
              </div>
              <code className="font-mono text-base tracking-[0.2em] text-teal-700 dark:text-teal-400">
                {s.join_code}
              </code>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">Create a class to get a code.</p>
      )}
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts & classes"
        subtitle="Provision people, group them into classes, and hand out join codes."
      />
      <Tabs
        tabs={[
          { id: "accounts", label: "Accounts", count: users?.length ?? 0, content: accountsPanel },
          { id: "classes", label: "Classes", count: sections?.length ?? 0, content: classesPanel },
          { id: "codes", label: "Class codes", content: codesPanel },
        ]}
      />
    </div>
  );
}
