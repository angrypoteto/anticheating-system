"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { classesEnabled, classSelfJoinAllowed } from "@/lib/settings";

export type SignupState = { error?: string };

/**
 * Self-service registration, deliberately gated on a class code.
 *
 * Supabase's own public signup endpoint is disabled, so this action is the only
 * self-service path into the system. It always creates a STUDENT — the database
 * trigger enforces that too, after a privilege escalation where a browser could
 * declare its own role (migration 20260904130000).
 */
export async function signup(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const sectionId = String(formData.get("sectionId") ?? "").trim();
  const rawNext = String(formData.get("next") ?? "");
  const next = /^\/(?!\/)/.test(rawNext) ? rawNext : "/";

  if (!email || !password) return { error: "Email and password are required." };
  if (password.length < 8) return { error: "Use at least 8 characters for your password." };
  if (password !== confirm) return { error: "Those passwords don't match." };
  // Registration is always open. A section is only part of it when classes
  // exist and students are the ones who join them; otherwise anything sent is
  // ignored, and an admin enrols them afterwards.
  const [classesOn, selfJoin] = await Promise.all([
    classesEnabled(),
    classSelfJoinAllowed(),
  ]);
  const useClasses = classesOn && selfJoin;

  const admin = createAdminClient();

  // Whether there is anything to pick decides whether one is demanded: a school
  // with classes switched on but none entered yet must not be a school where
  // nobody can register.
  const { data: available } = useClasses
    ? await admin.from("sections").select("id").limit(1)
    : { data: [] };
  const needsSection = useClasses && (available ?? []).length > 0;

  if (needsSection && !sectionId) {
    return { error: "Choose your section from the list." };
  }

  // The form sends an id, so it is checked against the table rather than
  // trusted — a request can be made by hand.
  const { data: section } = needsSection
    ? await admin
        .from("sections")
        .select("id, name, subject")
        .eq("id", sectionId)
        .maybeSingle()
    : { data: null };

  if (needsSection && !section) {
    return { error: "That section is no longer available. Choose another." };
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    // Don't confirm or deny whether an address is already registered.
    return /already|exists|registered/i.test(error.message)
      ? { error: "That email can't be used. If you already have an account, sign in instead." }
      : { error: error.message };
  }

  // A student can sit several subjects, so joining is an enrolment row rather
  // than a column on the account. With classes off there is nothing to join.
  if (section) {
    const { error: linkError } = await admin
      .from("enrollments")
      .insert({ student_id: created.user.id, section_id: section.id });

    if (linkError) {
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
      return { error: "Could not finish setting up your account. Try again." };
    }
  }

  // Sign them straight in — the account is already confirmed.
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) return { error: "Account created. Please sign in." };

  redirect(next);
}
