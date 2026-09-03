"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";

export type ActionState = { error?: string; success?: string };

const ROLES = ["INSTRUCTOR", "STUDENT"] as const;

export async function createAccount(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole("ADMIN");

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

  // The on_auth_user_created trigger mirrors this into public.users,
  // reading the role out of user_metadata.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role },
  });

  if (error) {
    return { error: error.message };
  }

  if (sectionId) {
    const { error: sectionError } = await admin
      .from("users")
      .update({ section_id: sectionId })
      .eq("id", data.user.id);
    if (sectionError) {
      return { error: `Account created, but section assignment failed: ${sectionError.message}` };
    }
  }

  revalidatePath("/admin");
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

  revalidatePath("/admin");
  return { success: `Account ${status.toLowerCase()}.` };
}

export async function createSection(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole("ADMIN");

  const name = String(formData.get("name") ?? "").trim();
  const instructorId = String(formData.get("instructorId") ?? "");

  if (!name) return { error: "Section name is required." };
  if (!instructorId) return { error: "Pick an instructor." };

  const admin = createAdminClient();
  const { error } = await admin.from("sections").insert({
    name,
    instructor_id: instructorId,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { success: `Section "${name}" created.` };
}
