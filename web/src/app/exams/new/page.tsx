import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CreateExamForm } from "../forms";

export const dynamic = "force-dynamic";

/** Building a new exam is its own screen; /exams is the list of existing ones. */
export default async function NewExamPage() {
  const me = await requireRole("INSTRUCTOR", "ADMIN");
  const supabase = await createClient();

  // Admins can build into any class; an instructor only into their own.
  const { data: sections } =
    me.role === "ADMIN"
      ? await supabase.from("sections").select("id, name").order("name")
      : await supabase.from("sections").select("id, name").eq("instructor_id", me.id).order("name");

  const backHref = me.role === "ADMIN" ? "/admin" : "/";

  return (
    <main className="min-h-screen bg-gray-50 p-6 lg:p-8 dark:bg-gray-950">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="border-b border-gray-200 pb-4 dark:border-gray-800">
          <Link
            href="/exams"
            className="text-sm text-gray-500 underline underline-offset-4 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            ← All exams
          </Link>
          <h1 className="mt-3 text-2xl font-semibold text-gray-900 dark:text-gray-50">
            Exam builder
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Name it and pick a class to start. You can add more classes, questions
            and lockdown settings on the next screen.
          </p>
        </header>

        <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          {sections?.length ? (
            <CreateExamForm sections={sections} />
          ) : (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p>You need a class before you can build an exam for it.</p>
              <Link
                href={backHref === "/admin" ? "/admin/accounts" : "/"}
                className="mt-2 inline-block font-medium text-teal-700 underline underline-offset-4 dark:text-teal-400"
              >
                {backHref === "/admin" ? "Create a class" : "Ask an administrator to assign you a class"}
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
