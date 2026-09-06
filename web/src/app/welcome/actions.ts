"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { whatIsMissing } from "@/lib/onboarding";

export type WelcomeState = { error?: string };

/**
 * Finish an account that arrived without a name, or without a class.
 *
 * Deliberately does not call requireRole: that is what sends people here, and
 * asking it again on the way out would be a loop.
 */
export async function completeProfile(
  _prev: WelcomeState,
  formData: FormData,
): Promise<WelcomeState> {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");
  if (profile.status !== "ACTIVE") redirect("/login?error=disabled");

  const fullName = String(formData.get("fullName") ?? "").replace(/\s+/g, " ").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const rawNext = String(formData.get("next") ?? "");
  const next = /^\/(?!\/)/.test(rawNext) ? rawNext : "/";

  const missing = await whatIsMissing(profile);

  if (missing.name) {
    if (fullName.length < 2) return { error: "Please enter your full name." };
    if (fullName.length > 80) return { error: "That name is too long." };
  }
  if (missing.className && !code) {
    return { error: "Enter the class code your teacher gave you." };
  }

  const supabase = await createClient();

  if (missing.name) {
    // Written as the person themselves: a database trigger allows the name and
    // username through and refuses role, status and email from this direction.
    const { error } = await supabase
      .from("users")
      .update({ full_name: fullName })
      .eq("id", profile.id);
    if (error) return { error: "Could not save your name. Try again." };
  }

  if (missing.className) {
    // join_class() is the authority — it refuses a bad code, a disabled
    // account, and a school that assigns classes itself.
    const { error } = await supabase.rpc("join_class", { code });
    if (error) {
      return {
        error: /does not match/i.test(error.message)
          ? "That code doesn't match any class. Check it with your teacher."
          : error.message,
      };
    }
  }

  redirect(next);
}
