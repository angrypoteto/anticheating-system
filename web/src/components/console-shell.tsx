import { createClient } from "@/lib/supabase/server";
import { classesEnabled } from "@/lib/settings";
import { AdminNav } from "@/app/admin/nav";
import { TeacherNav } from "@/app/teacher/nav";

/**
 * The console, for a page that lives outside /admin and /teacher.
 *
 * Both consoles are a rail and a column, and both get that from their route
 * layout — which works right up until a page belongs to the console but not to
 * its folder. Watching a sitting is exactly that page: a teacher gets to it
 * from Exams & quizzes and it is the same job, but its route is /exams/<id>,
 * so it rendered as a bare page with no rail and no way back except the
 * browser's own. This puts it back in the room it belongs to, with the rail
 * its role would see anywhere else.
 */
export async function ConsoleShell({
  role,
  email,
  children,
}: {
  role: string;
  email: string;
  children: React.ReactNode;
}) {
  const useClasses = await classesEnabled();

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("users")
    .select("full_name")
    .eq("email", email)
    .maybeSingle();

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 lg:flex-row">
      {role === "ADMIN" ? (
        <AdminNav email={email} useClasses={useClasses} />
      ) : (
        <TeacherNav email={email} name={profile?.full_name ?? null} useClasses={useClasses} />
      )}
      <div className="min-w-0 flex-1">
        <div className="p-6 lg:px-10 lg:pt-7.5 lg:pb-11">{children}</div>
      </div>
    </div>
  );
}
