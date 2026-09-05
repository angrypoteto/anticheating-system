import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GenerateStudio } from "./studio";

// Model calls are slow; give the action room rather than letting the platform
// default cut a generation off mid-flight.
export const maxDuration = 60;

export default async function GeneratePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("INSTRUCTOR", "ADMIN");
  const { id } = await params;

  const supabase = await createClient();
  const { data: exam } = await supabase
    .from("exams")
    .select("id, title")
    .eq("id", id)
    .maybeSingle();
  if (!exam) notFound();

  // Key availability is server-only information; the instructor just needs to know
  // whether generation is usable right now.
  const admin = createAdminClient();
  const { count: activeKeys } = await admin
    .from("ai_provider_keys")
    .select("id", { count: "exact", head: true })
    .eq("provider", "gemini")
    .eq("status", "ACTIVE");

  return (
    <main className="min-h-screen bg-slate-50 p-8 dark:bg-slate-950">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="border-b border-slate-200 pb-4 dark:border-slate-800">
          <Link
            href={`/exams/${exam.id}`}
            className="text-sm text-slate-500 underline underline-offset-4 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            ← Back to exam
          </Link>
          <h1 className="mt-3 text-2xl font-semibold text-slate-900 dark:text-slate-50">
            Generate questions
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {exam.title}
          </p>
        </header>

        {!activeKeys ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            No active AI provider key is configured, so generation will fail. An
            administrator can add one under Admin console → AI provider keys.
          </div>
        ) : null}

        <GenerateStudio examId={exam.id} />
      </div>
    </main>
  );
}
