import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { CreateAccountForm, CreateSectionForm, StatusToggle } from "../forms";
import { Card, PageHeader } from "../ui";

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

  return (
    <div className="space-y-8">
      <PageHeader
        title="Accounts & classes"
        subtitle="Provision people, group them into classes, and hand out join codes."
      />

      <Card title="Create account" hint="Confirmed immediately — share the temporary password directly with the person.">
        <CreateAccountForm sections={sections ?? []} />
      </Card>

      <Card title="Create class" hint="A class belongs to one instructor; students are assigned to it.">
        <CreateSectionForm instructors={instructors} />
      </Card>

      {sections?.length ? (
        <Card
          title="Class codes"
          hint="Students self-register at /signup with these. They always land as students — the database enforces it, not just the form."
        >
          <ul className="space-y-2">
            {sections.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-md border border-gray-200 px-4 py-2.5 dark:border-gray-700"
              >
                <span className="text-sm text-gray-900 dark:text-gray-100">{s.name}</span>
                <code className="font-mono text-sm tracking-widest text-teal-700 dark:text-teal-400">
                  {s.join_code}
                </code>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card title="Accounts" hint={`${users?.length ?? 0} total`} flush>
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
}
