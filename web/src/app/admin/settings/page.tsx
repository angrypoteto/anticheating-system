import { createAdminClient } from "@/lib/supabase/admin";
import { Card, PageHeader } from "../ui";
import { SettingsForm, type Settings } from "./form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const admin = createAdminClient();
  const { data } = await admin.from("system_settings").select("*").eq("id", true).maybeSingle();

  const settings: Settings = {
    institution_name: data?.institution_name ?? "Proctorly",
    pass_threshold: Number(data?.pass_threshold ?? 75),
    default_total_minutes: data?.default_total_minutes ?? 60,
    default_per_question_seconds: data?.default_per_question_seconds ?? null,
    default_max_strikes: data?.default_max_strikes ?? 3,
    default_fullscreen: data?.default_fullscreen ?? true,
    default_block_copy_paste: data?.default_block_copy_paste ?? true,
    default_honeypot: data?.default_honeypot ?? true,
    allow_student_signup: data?.allow_student_signup ?? true,
    classes_enabled: data?.classes_enabled ?? true,
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        subtitle="System-wide defaults. Changes apply to new exams and to how the risk report is calculated."
      />
      <Card>
        <SettingsForm settings={settings} />
      </Card>
      {data?.updated_at ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Last changed {new Date(data.updated_at).toLocaleString()}
        </p>
      ) : null}
    </div>
  );
}
