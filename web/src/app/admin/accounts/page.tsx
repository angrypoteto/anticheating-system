import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { classLabel } from "@/lib/classes";
import { classesEnabled } from "@/lib/settings";
import { AssignInstructor, CreateAccountForm, CreateSectionForm } from "../forms";
import { Card, PageHeader } from "../ui";
import { Directory, type Person } from "./directory";
import { Tabs } from "./tabs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Accounts & classes" };

export default async function AccountsPage() {
  const admin = await getCurrentUser();
  const useClasses = await classesEnabled();
  const supabase = await createClient();

  const [{ data: users }, { data: sections }, { data: enrollments }] = await Promise.all([
    supabase
      .from("users")
      .select("id, email, role, status, full_name, username")
      .order("role")
      .order("email"),
    supabase
      .from("sections")
      .select("id, name, subject, instructor_id, join_code")
      .order("subject")
      .order("name"),
    supabase.from("enrollments").select("student_id, section_id"),
  ]);

  const classes = (sections ?? []).map((s) => ({ id: s.id, label: classLabel(s) }));
  const instructors = (users ?? []).filter((u) => u.role === "INSTRUCTOR");

  // Which classes each student sits, and how many sit each class.
  const classesOf = new Map<string, string[]>();
  const rollOf = new Map<string, number>();
  for (const e of enrollments ?? []) {
    classesOf.set(e.student_id, [...(classesOf.get(e.student_id) ?? []), e.section_id]);
    rollOf.set(e.section_id, (rollOf.get(e.section_id) ?? 0) + 1);
  }

  const people: Person[] = (users ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    full_name: u.full_name ?? null,
    username: u.username ?? null,
    role: u.role,
    status: u.status,
    classIds: classesOf.get(u.id) ?? [],
  }));

  // Making an account is one thing you do here occasionally; reading the list
  // is what you came for. The form used to sit above the list permanently,
  // which put a six-field form between an admin and the only thing on the page
  // they use daily. It now opens from the toolbar, next to the filters that
  // narrow the same list.
  const accountsPanel = (
    <Card flush>
      <Directory
        people={people}
        classes={classes}
        adminId={admin?.id}
        useClasses={useClasses}
        createForm={<CreateAccountForm classes={useClasses ? classes : []} />}
      />
    </Card>
  );

  const classesPanel = (
    <div className="space-y-6">
      <Card
        title="Create class"
        hint="One subject for one section, with its own join code — the same class can be taught to several sections, and a section sits several subjects."
      >
        <CreateSectionForm instructors={instructors} />
      </Card>

      <Card title="Classes" hint={`${sections?.length ?? 0} total`} flush>
        {sections?.length ? (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {sections.map((s) => {
              const owner = (users ?? []).find((u) => u.id === s.instructor_id);
              const roll = rollOf.get(s.id) ?? 0;
              return (
                <li key={s.id} className="space-y-3 px-6 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {s.subject ?? s.name}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {s.subject ? `${s.name}, ` : ""}
                        {owner ? owner.full_name || owner.email : "no teacher yet"}, {roll}{" "}
                        student{roll === 1 ? "" : "s"}
                      </p>
                    </div>
                    <code className="font-mono text-sm tracking-widest text-teal-700 dark:text-teal-400">
                      {s.join_code}
                    </code>
                  </div>
                  <AssignInstructor
                    sectionId={s.id}
                    current={s.instructor_id}
                    instructors={instructors}
                  />
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
      hint="Each subject has its own code. Students join at /signup with their first one and can add the rest from their dashboard. They always land as students — the database enforces it, not just the form."
    >
      {sections?.length ? (
        <ul className="space-y-2">
          {sections.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700"
            >
              <div>
                <span className="text-sm text-gray-900 dark:text-gray-100">
                  {classLabel(s)}
                </span>
                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                  {rollOf.get(s.id) ?? 0} joined
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
        title={useClasses ? "Accounts & classes" : "Accounts"}
        subtitle={
          useClasses
            ? "Everyone with a login. Disabling keeps their results and stops them signing in; deleting removes the account and its sittings for good."
            : "Everyone with a login. Disabling keeps their results and stops them signing in; deleting removes the account and its sittings for good."
        }
      />
      <Tabs
        tabs={[
          { id: "accounts", label: "Accounts", count: users?.length ?? 0, content: accountsPanel },
          // Classes are switched off in Settings; the tabs go with them, and the
          // classes themselves are untouched underneath.
          ...(useClasses
            ? [
                {
                  id: "classes",
                  label: "Classes",
                  count: sections?.length ?? 0,
                  content: classesPanel,
                },
                { id: "codes", label: "Class codes", content: codesPanel },
              ]
            : []),
        ]}
      />
    </div>
  );
}
