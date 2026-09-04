import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { classesEnabled } from "@/lib/settings";
import { TeacherNav } from "./nav";

/**
 * Every /teacher route is for the person who sets the exams, and shares the
 * sidebar. Admins are allowed in too — they can do anything a teacher can, and
 * this is where that work lives.
 */
export default async function TeacherLayout({ children }: LayoutProps<"/teacher">) {
  const me = await requireRole("INSTRUCTOR", "ADMIN");
  const useClasses = await classesEnabled();

  // Their own name, read through their own session — no service role needed to
  // look at yourself.
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("users")
    .select("full_name")
    .eq("id", me.id)
    .maybeSingle();

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 lg:flex-row dark:bg-gray-950">
      <TeacherNav
        email={me.email}
        name={profile?.full_name ?? null}
        useClasses={useClasses}
      />
      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-5xl p-6 lg:p-10">{children}</div>
      </div>
    </div>
  );
}
