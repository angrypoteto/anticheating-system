import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Whether exams are organised by class at all.
 *
 * With this off, classes, subjects, join codes and enrolment disappear from
 * every instructor and student screen, and each published exam simply reaches
 * every student. Nothing is deleted — switching it back on restores the classes
 * exactly as they were. The database enforces the same rule independently, in
 * private.classes_enabled(), so hiding the UI is not what makes it true.
 */
export async function classesEnabled(): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("system_settings")
    .select("classes_enabled")
    .eq("id", true)
    .maybeSingle();
  return data?.classes_enabled ?? true;
}

/**
 * Whether students may register themselves at all.
 *
 * The database enforces this too — an account made while it is off is created
 * DISABLED — so this only decides whether to offer the forms.
 */
export async function selfSignupAllowed(): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("system_settings")
    .select("allow_student_signup")
    .eq("id", true)
    .maybeSingle();
  return data?.allow_student_signup ?? true;
}
