"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

export type ProfileState = { error?: string; success?: string };

/**
 * Writes through the user's own session, not the service role: the identity
 * trigger then refuses anything but name and username, so this cannot become a
 * way to change a role.
 */
export async function saveProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const me = await getCurrentUser();
  if (!me) return { error: "Not signed in." };

  const fullName = String(formData.get("fullName") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();

  if (username && !/^[A-Za-z0-9._-]{3,30}$/.test(username)) {
    return {
      error: "Usernames are 3–30 characters, using letters, numbers, dot, dash or underscore.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({ full_name: fullName || null, username: username || null })
    .eq("id", me.id);

  if (error) {
    if (/users_username_lower_key|duplicate/i.test(error.message)) {
      return { error: "That username is already taken." };
    }
    return { error: error.message };
  }

  revalidatePath("/admin/profile");
  return { success: "Profile saved." };
}
