"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { auditServerAction } from "@/lib/audit";

export type ActionState = { error?: string; success?: string };

const ROLES = ["INSTRUCTOR", "STUDENT"] as const;

export async function createAccount(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "");
  const sectionId = String(formData.get("sectionId") ?? "");

  if (!email || !password) return { error: "Email and password are required." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (!ROLES.includes(role as (typeof ROLES)[number])) {
    return { error: "Pick a valid role." };
  }

  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    return { error: error.message };
  }

  // The trigger always creates a STUDENT, whatever the caller supplied — signup
  // metadata is browser-controlled and a stranger could otherwise self-declare
  // ADMIN. Any role above student is granted here instead, by trusted server
  // code, after the account exists.
  // ACTIVE is set here rather than left to the trigger: the trigger disables
  // anyone who does not clear the self-registration gate, and an account an
  // admin typed in by hand is not self-registration.
  const { error: roleError } = await admin
    .from("users")
    .update({ role, status: "ACTIVE" })
    .eq("id", data.user.id);

  if (roleError) {
    // Don't leave a half-provisioned account behind.
    await admin.auth.admin.deleteUser(data.user.id).catch(() => {});
    return { error: `Could not set the account's role: ${roleError.message}` };
  }

  if (sectionId && role === "STUDENT") {
    const { error: enrolError } = await admin
      .from("enrollments")
      .insert({ student_id: data.user.id, section_id: sectionId });
    if (enrolError) {
      await admin.auth.admin.deleteUser(data.user.id).catch(() => {});
      return { error: `Could not enrol them: ${enrolError.message}` };
    }
  }

  await auditServerAction(actor.id, "create_account", "users", data.user.id, {
    email,
    role,
    section_id: sectionId || null,
  });

  revalidatePath("/admin/accounts");
  return { success: `Created ${role.toLowerCase()} account for ${email}.` };
}

export async function setAccountStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");

  const userId = String(formData.get("userId") ?? "");
  const status = String(formData.get("status") ?? "");

  if (status !== "ACTIVE" && status !== "DISABLED") {
    return { error: "Invalid status." };
  }
  if (userId === actor.id) {
    return { error: "You cannot disable your own account." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("users").update({ status }).eq("id", userId);
  if (error) return { error: error.message };

  // Revoking sessions is what actually locks a disabled user out; the status
  // column alone would leave an existing session valid until it expires.
  if (status === "DISABLED") {
    await admin.auth.admin.signOut(userId, "global").catch(() => {});
  }

  await auditServerAction(actor.id, "set_account_status", "users", userId, { status });

  revalidatePath("/admin");
  return { success: `Account ${status.toLowerCase()}.` };
}

export async function createSection(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");

  const subject = String(formData.get("subject") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const instructorId = String(formData.get("instructorId") ?? "");

  if (!subject) return { error: "Which subject is this class for?" };
  if (!name) return { error: "Which section sits it? e.g. BSIT 4C" };
  // A class may be created before anyone is staffed to it, so an instructor is
  // optional here and assigned later from the class list.

  const admin = createAdminClient();
  const { data: created, error } = await admin
    .from("sections")
    .insert({ subject, name, instructor_id: instructorId || null })
    .select("id")
    .single();
  if (error) {
    return {
      error: /duplicate|unique/i.test(error.message)
        ? `${subject} for ${name} already exists.`
        : error.message,
    };
  }

  await auditServerAction(actor.id, "create_section", "sections", created.id, {
    subject,
    name,
    instructor_id: instructorId || null,
  });

  revalidatePath("/admin/accounts");
  return {
    success: instructorId
      ? `${subject} for ${name} created.`
      : `${subject} for ${name} created. Assign a teacher when you are ready.`,
  };
}

/** Staff a class, move it to another teacher, or leave it unstaffed. */
export async function assignInstructor(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");

  const sectionId = String(formData.get("sectionId") ?? "");
  const instructorId = String(formData.get("instructorId") ?? "");
  if (!sectionId) return { error: "Which class?" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("sections")
    .update({ instructor_id: instructorId || null })
    .eq("id", sectionId);
  if (error) return { error: error.message };

  await auditServerAction(actor.id, "assign_instructor", "sections", sectionId, {
    instructor_id: instructorId || null,
  });

  revalidatePath("/admin/accounts");
  return { success: instructorId ? "Teacher assigned." : "Teacher removed." };
}


/** Put a student into a class, or take them out of one. */
export async function setEnrollment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");

  const studentId = String(formData.get("studentId") ?? "");
  const sectionId = String(formData.get("sectionId") ?? "");
  const enrol = String(formData.get("enrol") ?? "") === "1";
  if (!studentId || !sectionId) return { error: "Which student, and which class?" };

  const admin = createAdminClient();

  if (enrol) {
    const { error } = await admin
      .from("enrollments")
      .upsert({ student_id: studentId, section_id: sectionId }, {
        onConflict: "student_id,section_id",
      });
    if (error) return { error: error.message };
  } else {
    const { error } = await admin
      .from("enrollments")
      .delete()
      .eq("student_id", studentId)
      .eq("section_id", sectionId);
    if (error) return { error: error.message };
  }

  await auditServerAction(
    actor.id,
    enrol ? "enrol_student" : "unenrol_student",
    "users",
    studentId,
    { section_id: sectionId },
  );

  revalidatePath("/admin/accounts");
  revalidatePath("/admin/students");
  return { success: enrol ? "Enrolled." : "Removed from the class." };
}
