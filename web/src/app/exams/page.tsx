import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CreateExamForm } from "./forms";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "text-amber-700 dark:text-amber-400",
  PUBLISHED: "text-green-700 dark:text-green-400",
  ARCHIVED: "text-gray-400 dark:text-gray-500",
};

export default async function ExamsPage() {
  await requireRole("INSTRUCTOR", "ADMIN");
  const supabase = await createClient();

  const [{ data: exams }, { data: sections }] = await Promise.all([
    supabase
      .from("exams")
      .select("id, title, status, section_id, updated_at")
      .order("updated_at", { ascending: false }),
    supabase.from("sections").select("id, name").order("name"),
  ]);

  const sectionName = new Map((sections ?? []).map((s) => [s.id, s.name]));

  return (
    <main className="min-h-screen bg-gray-50 p-8 dark:bg-gray-950">
      <div className="mx-auto max-w-4xl space-y-10">
        <header className="flex items-baseline justify-between border-b border-gray-200 pb-4 dark:border-gray-800">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
            Exams
          </h1>
          <Link
            href="/"
            className="text-sm text-gray-500 underline underline-offset-4 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            Back
          </Link>
        </header>

        <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-4 text-lg font-medium text-gray-900 dark:text-gray-50">
            New exam
          </h2>
          <CreateExamForm sections={sections ?? []} />
        </section>

        <section className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 p-6 dark:border-gray-800">
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-50">
              Your exams
            </h2>
          </div>

          {exams?.length ? (
            <ul>
              {exams.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between border-b border-gray-100 px-6 py-4 last:border-0 dark:border-gray-800"
                >
                  <div>
                    <Link
                      href={`/exams/${e.id}`}
                      className="font-medium text-gray-900 underline-offset-4 hover:underline dark:text-gray-100"
                    >
                      {e.title}
                    </Link>
                    <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                      {e.section_id ? (sectionName.get(e.section_id) ?? "—") : "—"}
                    </p>
                  </div>
                  <span className={`text-sm ${STATUS_STYLES[e.status] ?? ""}`}>
                    {e.status.toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-6 text-sm text-gray-500 dark:text-gray-400">
              No exams yet.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
