import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CreateAccountForm, CreateSectionForm, StatusToggle } from "./forms";

export default async function AdminPage() {
  const admin = await requireRole("ADMIN");

  // Read through the admin's own session so the page reflects RLS rather than
  // bypassing it; the service role is used only for writes that need it.
  const supabase = await createClient();

  const [{ data: users }, { data: sections }] = await Promise.all([
    supabase
      .from("users")
      .select("id, email, role, status, section_id")
      .order("role")
      .order("email"),
    supabase.from("sections").select("id, name, instructor_id").order("name"),
  ]);

  const sectionName = new Map((sections ?? []).map((s) => [s.id, s.name]));
  const instructors = (users ?? []).filter((u) => u.role === "INSTRUCTOR");

  return (
    <main className="min-h-screen bg-gray-50 p-8 dark:bg-gray-950">
      <div className="mx-auto max-w-4xl space-y-10">
        <header className="flex items-baseline justify-between border-b border-gray-200 pb-4 dark:border-gray-800">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
              Admin console
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Signed in as {admin.email}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/admin/keys"
              className="text-sm text-gray-600 underline underline-offset-4 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            >
              AI provider keys
            </Link>
            <Link
              href="/"
              className="text-sm text-gray-500 underline underline-offset-4 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            >
              Back
            </Link>
          </div>
        </header>

        <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-50">
            Create account
          </h2>
          <p className="mt-1 mb-4 text-sm text-gray-500 dark:text-gray-400">
            The account is confirmed immediately — share the temporary password
            directly with the person.
          </p>
          <CreateAccountForm sections={sections ?? []} />
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-50">
            Create section
          </h2>
          <p className="mt-1 mb-4 text-sm text-gray-500 dark:text-gray-400">
            A section belongs to one instructor; students are assigned to it.
          </p>
          <CreateSectionForm instructors={instructors} />
        </section>

        <section className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 p-6 dark:border-gray-800">
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-50">
              Accounts
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {users?.length ?? 0} total
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <tr>
                  <th className="px-6 py-3 font-medium">Email</th>
                  <th className="px-6 py-3 font-medium">Role</th>
                  <th className="px-6 py-3 font-medium">Section</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {(users ?? []).map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-gray-100 last:border-0 dark:border-gray-800"
                  >
                    <td className="px-6 py-3 text-gray-900 dark:text-gray-100">
                      {u.email}
                    </td>
                    <td className="px-6 py-3 text-gray-600 dark:text-gray-400">
                      {u.role.toLowerCase()}
                    </td>
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
                      {u.id === admin.id ? (
                        <span className="text-xs text-gray-400 dark:text-gray-600">
                          you
                        </span>
                      ) : (
                        <StatusToggle userId={u.id} status={u.status} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
