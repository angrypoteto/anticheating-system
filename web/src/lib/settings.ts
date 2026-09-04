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
