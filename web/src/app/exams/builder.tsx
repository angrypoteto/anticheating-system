import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CreateExamForm } from "./forms";
import { classesEnabled } from "@/lib/settings";

/**
 * The "start a new exam" form, shared by the two places it appears: the
 * standalone /exams/new screen an instructor uses, and /admin/exams/new, which
 * renders inside the console so an admin keeps their sidebar.
 */
export async function ExamBuilder() {
  const me = await requireRole("INSTRUCTOR", "ADMIN");
  const supabase = await createClient();

  // The subject list is school-wide, so it is worth having whether or not
  // classes are switched on.
  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, name")
    .order("name");

  // With classes switched off an exam belongs to nobody in particular: it
  // reaches every student, so there is nothing to pick.
  if (!(await classesEnabled())) {
    return <CreateExamForm sections={[]} subjects={subjects ?? []} classless />;
  }

  // Admins can build into any class; an instructor only into their own.
  const { data: sections } =
    me.role === "ADMIN"
      ? await supabase.from("sections").select("id, name, subject").order("subject").order("name")
      : await supabase.from("sections").select("id, name, subject").eq("instructor_id", me.id).order("subject").order("name");

  if (sections?.length) {
    return <CreateExamForm sections={sections} subjects={subjects ?? []} />;
  }

  return (
    <div className="text-sm text-slate-600 dark:text-slate-400">
      <p>You need a class before you can build an exam for it.</p>
      {me.role === "ADMIN" ? (
        <Link
          href="/admin/accounts"
          className="mt-2 inline-block font-medium text-indigo-700 underline underline-offset-4 dark:text-indigo-400"
        >
          Create a class
        </Link>
      ) : (
        <p className="mt-2">Ask an administrator to assign you a class.</p>
      )}
    </div>
  );
}

// Deliberately says nothing about classes: they can be switched off, and this
// same line is shown either way.
export const BUILDER_BLURB =
  "Name it and give it a subject to start. On the next screen you can write the questions yourself or have the AI draft them from a lesson file, then set the timer, the lockdown rules and when it opens.";
