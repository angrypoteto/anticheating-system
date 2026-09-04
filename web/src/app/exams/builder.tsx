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

  // With classes switched off an exam belongs to nobody in particular: it
  // reaches every student, so there is nothing to pick.
  if (!(await classesEnabled())) return <CreateExamForm sections={[]} classless />;

  // Admins can build into any class; an instructor only into their own.
  const { data: sections } =
    me.role === "ADMIN"
      ? await supabase.from("sections").select("id, name, subject").order("subject").order("name")
      : await supabase.from("sections").select("id, name, subject").eq("instructor_id", me.id).order("subject").order("name");

  if (sections?.length) return <CreateExamForm sections={sections} />;

  return (
    <div className="text-sm text-gray-600 dark:text-gray-400">
      <p>You need a class before you can build an exam for it.</p>
      {me.role === "ADMIN" ? (
        <Link
          href="/admin/accounts"
          className="mt-2 inline-block font-medium text-teal-700 underline underline-offset-4 dark:text-teal-400"
        >
          Create a class
        </Link>
      ) : (
        <p className="mt-2">Ask an administrator to assign you a class.</p>
      )}
    </div>
  );
}

export const BUILDER_BLURB =
  "Name it and pick a class to start. On the next screen you can write questions yourself or have the AI draft them from your lesson file, then set the timer and lockdown rules.";
