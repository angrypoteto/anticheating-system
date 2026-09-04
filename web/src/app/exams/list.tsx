import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseTimer } from "@/lib/exam-config";
import { classLabel } from "@/lib/classes";
import { classesEnabled } from "@/lib/settings";
import { siteUrl } from "@/lib/site-url";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "text-amber-700 dark:text-amber-400",
  PUBLISHED: "text-green-700 dark:text-green-400",
  ARCHIVED: "text-gray-400 dark:text-gray-500",
};

/** Manila time, since that is where the exams are actually sat. */
const when = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Manila",
      })
    : null;

const duration = (minutes: number) => {
  if (!minutes) return "No time limit";
  if (minutes < 60) return `${minutes} minutes`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h} hour${h === 1 ? "" : "s"}`;
};

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-gray-900 dark:text-gray-100">{children}</dd>
    </div>
  );
}

/**
 * The list of exams already made, shared by the standalone /exams screen and
 * /admin/exams. Each row opens in place — who set it, which classes sit it and
 * when — so you can check an exam without leaving the list to open the editor.
 */
export async function ExamList() {
  await requireRole("INSTRUCTOR", "ADMIN");
  const supabase = await createClient();

  const [{ data: exams }, { data: sections }, { data: people }] = await Promise.all([
    supabase
      .from("exams")
      .select(
        "id, title, status, section_id, created_at, published_at, timer_config, created_by_id, share_token, opens_at, closes_at, subjects(name), exam_sections(section_id)",
      )
      .order("created_at", { ascending: false }),
    supabase.from("sections").select("id, name, subject"),
    supabase.from("users").select("id, full_name, email"),
  ]);

  const sectionName = new Map((sections ?? []).map((s) => [s.id, classLabel(s)]));
  const useClasses = await classesEnabled();
  const base = await siteUrl();
  const personName = new Map(
    (people ?? []).map((p) => [p.id, p.full_name || p.email]),
  );

  if (!exams?.length) {
    return (
      <p className="p-6 text-sm text-gray-500 dark:text-gray-400">
        Nothing made yet. Generate your first exam or quiz to see it here.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
      {exams.map((e) => {
        // An exam is delivered to every class in exam_sections; section_id is
        // the class it was first built for, and older exams only have that.
        const ids = new Set<string>(
          (e.exam_sections ?? []).map((t: { section_id: string }) => t.section_id),
        );
        if (e.section_id) ids.add(e.section_id);
        const classes = [...ids].map((id) => sectionName.get(id) ?? "unknown class");
        const timer = parseTimer(e.timer_config);
        const published = when(e.published_at);
        const nowMs = Date.now();
        const notYet = e.opens_at && new Date(e.opens_at).getTime() > nowMs;
        const over = e.closes_at && new Date(e.closes_at).getTime() <= nowMs;
        // PostgREST types a to-one embed as an array; accept either.
        const subjectEmbed = e.subjects as { name: string } | { name: string }[] | null;
        const subject = (Array.isArray(subjectEmbed) ? subjectEmbed[0] : subjectEmbed)?.name ?? null;
        const availability =
          e.status !== "PUBLISHED"
            ? null
            : over
              ? `Closed ${when(e.closes_at)}`
              : notYet
                ? `Opens ${when(e.opens_at)}`
                : e.closes_at
                  ? `Open until ${when(e.closes_at)}`
                  : "Open";

        return (
          <li key={e.id}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900 dark:text-gray-100">
                    {e.title}
                  </p>
                  {subject ? (
                    <p className="mt-0.5 truncate text-xs text-teal-700 dark:text-teal-400">
                      {subject}
                    </p>
                  ) : null}
                  {useClasses ? (
                    <p className="mt-0.5 truncate text-sm text-gray-500 dark:text-gray-400">
                      {classes.length ? classes.join(", ") : "No class assigned"}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={`text-sm ${STATUS_STYLES[e.status] ?? ""}`}>
                    {e.status.toLowerCase()}
                  </span>
                  <span
                    aria-hidden
                    className="text-gray-400 transition group-open:rotate-90 dark:text-gray-500"
                  >
                    ›
                  </span>
                </div>
              </summary>

              <div className="border-t border-gray-100 bg-gray-50/60 px-6 py-4 dark:border-gray-800 dark:bg-gray-950/40">
                <dl className="grid gap-4 sm:grid-cols-2">
                  {subject ? <Detail label="Subject">{subject}</Detail> : null}

                  {useClasses ? (
                  <Detail label="Given to">
                    {classes.length ? (
                      <ul className="space-y-0.5">
                        {classes.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-gray-500 dark:text-gray-400">
                        Not assigned to a class yet
                      </span>
                    )}
                  </Detail>
                  ) : null}

                  <Detail label="Set by">
                    {personName.get(e.created_by_id) ?? (
                      <span className="text-gray-500 dark:text-gray-400">Unknown</span>
                    )}
                  </Detail>

                  <Detail label="Time allowed">
                    {duration(timer.totalMinutes)}
                    {timer.perQuestionSeconds ? (
                      <span className="text-gray-500 dark:text-gray-400">
                        {" "}
                        · {timer.perQuestionSeconds}s per question
                      </span>
                    ) : null}
                  </Detail>

                  {availability ? (
                    <Detail label="Availability">{availability}</Detail>
                  ) : null}

                  <Detail label="Student link">
                    {e.status === "PUBLISHED" ? (
                      <a
                        href={`${base}/e/${e.share_token}`}
                        className="break-all font-mono text-xs text-teal-700 underline underline-offset-4 dark:text-teal-400"
                      >
                        {`${base}/e/${e.share_token}`}
                      </a>
                    ) : (
                      <span className="text-gray-500 dark:text-gray-400">
                        Publish it to hand out the link
                      </span>
                    )}
                  </Detail>

                  <Detail label={published ? "Given on" : "Not yet given"}>
                    {published ?? (
                      <span className="text-gray-500 dark:text-gray-400">
                        Made {when(e.created_at)} — publish it to send it out
                      </span>
                    )}
                  </Detail>
                </dl>

                <div className="mt-4 flex flex-wrap gap-4 text-sm">
                  <Link
                    href={`/exams/${e.id}`}
                    className="font-medium text-teal-700 underline underline-offset-4 dark:text-teal-400"
                  >
                    Open editor
                  </Link>
                  {e.status === "PUBLISHED" ? (
                    <Link
                      href={`/exams/${e.id}/monitor?from=list`}
                      className="text-gray-600 underline underline-offset-4 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                    >
                      Watch it live
                    </Link>
                  ) : null}
                </div>
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
