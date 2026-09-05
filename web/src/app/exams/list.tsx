import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseTimer } from "@/lib/exam-config";
import { classLabel } from "@/lib/classes";
import { classesEnabled } from "@/lib/settings";
import { siteUrl } from "@/lib/site-url";

const STATUS_STYLES: Record<string, string> = {
  DRAFT:
    "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-500/10 dark:text-amber-300",
  PUBLISHED:
    "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300",
  ARCHIVED: "bg-slate-100 text-slate-500 ring-slate-600/10 dark:bg-slate-800 dark:text-slate-400",
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
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{children}</dd>
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
      <div className="p-8 text-center">
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Nothing made yet. Generate your first exam or quiz to see it here.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2.5 p-5 sm:p-6">
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
          <li key={e.id} className="group overflow-hidden rounded-2xl border border-slate-200/70 bg-white transition hover:border-slate-300 hover:shadow-[0_8px_24px_-12px_rgb(15_23_42/0.18)] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
            <details className="group/details">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40 [&::-webkit-details-marker]:hidden">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600/10 text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                    {e.title[0]?.toUpperCase() ?? "E"}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold tracking-tight text-slate-900 dark:text-white">
                      {e.title}
                    </p>
                    {subject ? (
                      <p className="mt-0.5 truncate text-xs font-medium text-indigo-600 dark:text-indigo-400">
                        {subject}
                      </p>
                    ) : null}
                    {useClasses ? (
                      <p className="mt-0.5 truncate text-[13px] text-slate-500 dark:text-slate-400">
                        {classes.length ? classes.join(", ") : "No class assigned"}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[e.status] ?? ""}`}>
                    {e.status.toLowerCase()}
                  </span>
                  <span
                    aria-hidden
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition group-open/details:rotate-90 group-open/details:bg-indigo-600 group-open/details:text-white dark:bg-slate-800 dark:text-slate-500"
                  >
                    ›
                  </span>
                </div>
              </summary>

              <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4 dark:border-slate-800 dark:bg-slate-950/40">
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
                      <span className="font-normal text-slate-500 dark:text-slate-400">
                        Not assigned to a class yet
                      </span>
                    )}
                  </Detail>
                  ) : null}

                  <Detail label="Set by">
                    {personName.get(e.created_by_id) ?? (
                      <span className="font-normal text-slate-500 dark:text-slate-400">Unknown</span>
                    )}
                  </Detail>

                  <Detail label="Time allowed">
                    {duration(timer.totalMinutes)}
                    {timer.perQuestionSeconds ? (
                      <span className="font-normal text-slate-500 dark:text-slate-400">
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
                        className="break-all rounded-lg bg-indigo-50 px-2 py-1 font-mono text-xs text-indigo-700 ring-1 ring-inset ring-indigo-600/20 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300"
                      >
                        {`${base}/e/${e.share_token}`}
                      </a>
                    ) : (
                      <span className="font-normal text-slate-500 dark:text-slate-400">
                        Publish it to hand out the link
                      </span>
                    )}
                  </Detail>

                  <Detail label={published ? "Given on" : "Not yet given"}>
                    {published ?? (
                      <span className="font-normal text-slate-500 dark:text-slate-400">
                        Made {when(e.created_at)} — publish it to send it out
                      </span>
                    )}
                  </Detail>
                </dl>

                <div className="mt-4 flex flex-wrap gap-2.5">
                  <Link
                    href={`/exams/${e.id}`}
                    className="rounded-xl bg-slate-900 px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                  >
                    Open editor
                  </Link>
                  {e.status === "PUBLISHED" ? (
                    <Link
                      href={`/exams/${e.id}/monitor?from=list`}
                      className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
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
