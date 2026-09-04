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
 * Whether students may put themselves into a class with a join code.
 *
 * This is not about registering — anyone may make an account. It decides who
 * assigns classes: the students themselves with a code, or an admin. The
 * database enforces it in join_class(), so this only decides whether to offer
 * the code fields.
 */
export async function classSelfJoinAllowed(): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("system_settings")
    .select("allow_class_self_join")
    .eq("id", true)
    .maybeSingle();
  return data?.allow_class_self_join ?? true;
}
