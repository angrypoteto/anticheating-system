"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { auditServerAction } from "@/lib/audit";

export type SettingsState = { error?: string; success?: string };

const num = (v: FormDataEntryValue | null, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export async function saveSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const actor = await requireRole("ADMIN");

  const passThreshold = Math.min(100, Math.max(0, num(formData.get("passThreshold"), 75)));
  const totalMinutes = Math.max(0, num(formData.get("defaultTotalMinutes"), 60));
  const perQuestionOn = formData.get("perQuestionEnabled") === "on";
  const perQuestion = perQuestionOn
    ? Math.max(5, num(formData.get("defaultPerQuestionSeconds"), 60))
    : null;
  const maxStrikes = Math.max(1, num(formData.get("defaultMaxStrikes"), 3));
  const institution = String(formData.get("institutionName") ?? "").trim() || "Proctorly";

  const admin = createAdminClient();
  const { error } = await admin
    .from("system_settings")
    .update({
      institution_name: institution,
      pass_threshold: passThreshold,
      default_total_minutes: totalMinutes,
      default_per_question_seconds: perQuestion,
      default_max_strikes: maxStrikes,
      default_fullscreen: formData.get("defaultFullscreen") === "on",
      default_block_copy_paste: formData.get("defaultBlockCopyPaste") === "on",
      default_honeypot: formData.get("defaultHoneypot") === "on",
      allow_student_signup: formData.get("allowStudentSignup") === "on",
      classes_enabled: formData.get("classesEnabled") === "on",
      allowed_email_domains: String(formData.get("allowedEmailDomains") ?? "").trim(),
      updated_at: new Date().toISOString(),
      updated_by: actor.id,
    })
    .eq("id", true);

  if (error) return { error: error.message };

  await auditServerAction(actor.id, "update_system_settings", "system_settings", actor.id, {
    pass_threshold: passThreshold,
    allow_student_signup: formData.get("allowStudentSignup") === "on",
    classes_enabled: formData.get("classesEnabled") === "on",
    allowed_email_domains: String(formData.get("allowedEmailDomains") ?? "").trim(),
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/students");
  return { success: "Settings saved." };
}
