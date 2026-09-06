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
  const sectionId = String(formData.get("sectionId") ?? "").trim();
  const rawNext = String(formData.get("next") ?? "");
  const next = /^\/(?!\/)/.test(rawNext) ? rawNext : "/";

  const missing = await whatIsMissing(profile);
  const supabase = await createClient();

  // The same question the page asked when it drew the form: a student is never
  // held to a list that has nothing on it.
  const { data: pickable } = missing.className
    ? await supabase.rpc("selectable_sections")
    : { data: [] };
  const askSection = missing.className && ((pickable ?? []) as unknown[]).length > 0;

  if (missing.name) {
    if (fullName.length < 2) return { error: "Please enter your full name." };
    if (fullName.length > 80) return { error: "That name is too long." };
  }
  if (askSection && !sectionId) {
    return { error: "Choose your section from the list." };
  }

  if (missing.name) {
    // Written as the person themselves: a database trigger allows the name and
    // username through and refuses role, status and email from this direction.
    const { error } = await supabase
      .from("users")
      .update({ full_name: fullName })
      .eq("id", profile.id);
    if (error) return { error: "Could not save your name. Try again." };
  }

  if (askSection) {
    // join_section() is the authority — it refuses a section that has since
    // been deleted, a disabled account, and a school that assigns classes
    // itself. There is still no student INSERT policy on enrollments, so a
    // crafted request cannot reach the table any other way.
    const { error } = await supabase.rpc("join_section", { p_section_id: sectionId });
    if (error) {
      return {
        error: /no longer exists/i.test(error.message)
          ? "That section has been removed. Pick another, or ask your teacher."
          : error.message,
      };
    }
  }

  redirect(next);
}
