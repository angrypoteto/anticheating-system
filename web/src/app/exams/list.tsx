import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "text-amber-700 dark:text-amber-400",
  PUBLISHED: "text-green-700 dark:text-green-400",
  ARCHIVED: "text-gray-400 dark:text-gray-500",
};

/**
 * The list of exams already made, shared by the standalone /exams screen and
 * /admin/exams, which shows the same thing without dropping an admin out of
 * the console.
 */
export async function ExamList() {
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

  if (!exams?.length) {
    return (
      <p className="p-6 text-sm text-gray-500 dark:text-gray-400">
        Nothing made yet. Generate your first exam or quiz to see it here.
      </p>
    );
  }

  return (
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
  );
}
