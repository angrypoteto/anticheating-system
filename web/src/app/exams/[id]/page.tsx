import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseLockdown, parseTimer } from "@/lib/exam-config";
import { ConsoleShell } from "@/components/console-shell";
import { AddQuestion, QuestionCard, SettingsForm } from "./editor";
import { ExamPreview } from "./preview";
import { ClassTargets, PublishControls } from "./publish";
import { ShareLink } from "./share";
import { ExamWindow } from "./window";
import { Roster, type RosterPerson } from "./roster";
import { siteUrl } from "@/lib/site-url";
import { classesEnabled } from "@/lib/settings";

// PostgREST returns this embed as an object (question_id is question_answers'
// primary key, making it one-to-one) while supabase-js's inference types it as an
// array. Accept either, so neither a client-library nor an FK change breaks it.
function readAnswerKey(embed: unknown): unknown {
  const row = Array.isArray(embed) ? embed[0] : embed;
  return (row as { correct_answer?: unknown } | null | undefined)?.correct_answer ?? null;
}

/**
 * The tab says which paper this is, so half a dozen open at once are telling
 * them apart by name rather than by position.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("exams")
    .select("title")
    .eq("id", id)
    .maybeSingle();
  return { title: data?.title ? `${data.title}` : "Exam" };
}

const TABS = [
  { id: "questions", label: "Questions" },
  { id: "settings", label: "Settings" },
  { id: "students", label: "Students & schedule" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const minutesText = (m: number) =>
  !m ? "no time limit" : m < 60 ? `${m} minutes` : m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60} hour${m === 60 ? "" : "s"}`;

/**
 * One exam, from writing it to handing it out.
 *
 * This was a single page eight panels long — the link, the roster, the
 * schedule, the questions, a form to add one, every setting and a preview —
 * all open at once, in an order that had the link to send students above the
 * questions it would send them. A teacher opening it for the first time met
 * everything they might ever need and no hint of where to start.
 *
 * Now it is three tabs in the order the work is done: write the questions,
 * decide how it is sat, then decide who sits it and when. The header keeps the
 * one action that matters at every stage — publish — and a short checklist on
 * the questions tab says what is left.
 */
export default async function ExamEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const me = await requireRole("INSTRUCTOR", "ADMIN");
  const { id } = await params;
  const asked = (await searchParams).tab;
  const tab: Tab = TABS.some((t) => t.id === asked) ? (asked as Tab) : "questions";
  const supabase = await createClient();

  const { data: exam } = await supabase
    .from("exams")
    .select("id, title, status, section_id, timer_config, lockdown_config, share_token, opens_at, closes_at, subject_id, subjects(name)")
    .eq("id", id)
    .maybeSingle();

  if (!exam) notFound();

  const [{ data: questions }, { data: targets }, { data: myClasses }, { data: subjects }, useClasses] =
    await Promise.all([
      supabase
        .from("questions")
        .select("id, type, prompt, choices, question_answers(correct_answer)")
        .eq("exam_id", id)
        .order("order"),
      supabase.from("exam_sections").select("section_id").eq("exam_id", id),
      // Admins can deliver to any class; an instructor only to their own.
      me.role === "ADMIN"
        ? supabase.from("sections").select("id, name, subject").order("subject").order("name")
        : supabase.from("sections").select("id, name, subject").eq("instructor_id", me.id).order("subject").order("name"),
      supabase.from("subjects").select("id, name").order("name"),
      classesEnabled(),
    ]);

  const timer = parseTimer(exam.timer_config);
  const lockdown = parseLockdown(exam.lockdown_config);
  const published = exam.status === "PUBLISHED";
  const shareUrl = `${await siteUrl()}/e/${exam.share_token}`;

  // The same rule the database enforces, so the badge cannot claim the exam is
  // open while a student is being turned away.
  const nowMs = Date.now();
  const notYet = Boolean(exam.opens_at && new Date(exam.opens_at).getTime() > nowMs);
  const over = Boolean(exam.closes_at && new Date(exam.closes_at).getTime() <= nowMs);
  const examIsOpen = published && !notYet && !over;
  const selectedClasses = (targets ?? []).map((t) => t.section_id);

  // PostgREST types a to-one embed as an array; accept either.
  const subjectEmbed = exam.subjects as { name: string } | { name: string }[] | null;
  const subjectName =
    (Array.isArray(subjectEmbed) ? subjectEmbed[0] : subjectEmbed)?.name ?? null;

  // Who the paper is for, and who has actually sat it. Without the roster the
  // only students the system knows about are those who already turned up.
  const [{ data: roster }, { data: sat }, { data: everyone }] = await Promise.all([
    supabase.from("exam_access").select("student_id").eq("exam_id", exam.id),
    supabase.from("exam_sessions").select("student_id, status").eq("exam_id", exam.id),
    supabase.from("users").select("id, email, full_name").eq("role", "STUDENT"),
  ]);
  const onRoster = new Set((roster ?? []).map((r) => r.student_id));
  const hasSat = new Set((sat ?? []).map((r) => r.student_id));
  // Whether it can go back to draft right now, and what that would mean for the
  // papers already handed in.
  const inProgress = (sat ?? []).filter((r) => r.status === "IN_PROGRESS").length;
  const submitted = (sat ?? []).length - inProgress;
  const people: RosterPerson[] = (everyone ?? [])
    .map((u) => ({
      id: u.id,
      name: u.full_name || u.email,
      sat: hasSat.has(u.id),
      onRoster: onRoster.has(u.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const qs = questions ?? [];

  const status =
    exam.status === "ARCHIVED"
      ? { word: "Archived", tone: "border-gray-200 bg-gray-100 text-gray-700" }
      : !published
        ? { word: "Draft", tone: "border-gray-200 bg-white text-gray-700" }
        : over
          ? { word: "Closed", tone: "border-gray-200 bg-gray-100 text-gray-700" }
          : notYet
            ? { word: "Scheduled", tone: "border-amber-200 bg-amber-50 text-amber-900" }
            : { word: "Open to students", tone: "border-green-200 bg-green-50 text-green-800" };

  const tabHref = (t: Tab) => (t === "questions" ? `/exams/${exam.id}` : `/exams/${exam.id}?tab=${t}`);

  // What is left before students can sit it, in the order it is done.
  const steps = [
    { done: qs.length > 0, label: qs.length ? `${qs.length} question${qs.length === 1 ? "" : "s"} written` : "Write the questions" },
    {
      done: true,
      label: `Time limit: ${minutesText(timer.totalMinutes)}`,
      href: tabHref("settings"),
      action: "Change",
    },
    { done: published, label: published ? "Published" : "Publish it, using the button at the top" },
    {
      // Nothing can see a link being sent; somebody having started is the proof.
      done: submitted + inProgress > 0,
      label: submitted + inProgress > 0 ? "Students have started" : "Send students the link",
      href: tabHref("students"),
      action: "Get the link",
    },
  ];

  return (
    <ConsoleShell role={me.role as string} email={me.email}>
      <div className="space-y-6">
        <div>
          <Link
            href={me.role === "ADMIN" ? "/admin/exams" : "/teacher/exams"}
            className="text-[13px] text-gray-500 hover:text-gray-900"
          >
            ← All exams &amp; quizzes
          </Link>
        </div>

        <header className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            {subjectName ? (
              <span className="mb-1.5 block text-[12.5px] font-medium text-accent">{subjectName}</span>
            ) : null}
            <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-gray-900">
              {exam.title}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-2.5 text-sm text-gray-500">
              <span
                className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] font-medium ${status.tone}`}
              >
                {status.word === "Open to students" ? (
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
                ) : null}
                {status.word}
              </span>
              <span>
                {qs.length} question{qs.length === 1 ? "" : "s"}, {minutesText(timer.totalMinutes)}
                {useClasses ? `, ${selectedClasses.length} class${selectedClasses.length === 1 ? "" : "es"}` : ""}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {qs.length ? (
              // Its own tab: the demo goes fullscreen and asks for the screen,
              // and the editor should still be here afterwards.
              <Link
                href={`/exams/${exam.id}/demo`}
                target="_blank"
                className="inline-flex h-[38px] items-center rounded-lg border border-gray-200 bg-white px-3.5 text-sm font-medium text-gray-700 hover:border-gray-400 hover:text-gray-900"
              >
                Try it as a student
              </Link>
            ) : null}
            {published || submitted || inProgress ? (
              <Link
                href={`/exams/${exam.id}/monitor`}
                className="inline-flex h-[38px] items-center rounded-lg border border-gray-200 bg-white px-3.5 text-sm font-medium text-gray-700 hover:border-gray-400 hover:text-gray-900"
              >
                Watch live &amp; results
              </Link>
            ) : null}
            <PublishControls
              examId={exam.id}
              status={exam.status}
              questionCount={qs.length}
              classCount={selectedClasses.length}
              submitted={submitted}
              inProgress={inProgress}
            />
          </div>
        </header>

        <nav aria-label="Exam sections" className="-mx-1 overflow-x-auto border-b border-gray-200">
          <ul className="flex min-w-max gap-1 px-1">
            {TABS.map((t) => {
              const on = t.id === tab;
              return (
                <li key={t.id}>
                  <Link
                    href={tabHref(t.id)}
                    aria-current={on ? "page" : undefined}
                    className={`-mb-px flex h-11 items-center gap-2 border-b-2 px-3 text-sm whitespace-nowrap ${
                      on
                        ? "border-gray-900 font-semibold text-gray-900"
                        : "border-transparent text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    {t.label}
                    {t.id === "questions" ? (
                      <span className="rounded-full bg-gray-100 px-1.75 text-[12px] font-medium tabular-nums text-gray-600">
                        {qs.length}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {tab === "questions" ? (
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-4">
              {published ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Students can see this exam, so its questions are locked. To change them, press{" "}
                  <strong className="font-semibold">Edit questions</strong> at the top: it goes back to a draft until you
                  publish it again.
                </p>
              ) : submitted ? (
                <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
                  {submitted === 1 ? "One student has" : `${submitted} students have`} already taken this exam
                  and keep their score. You can edit the questions they answered, but not delete them.
                </p>
              ) : null}

              <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3.5">
                  <h2 className="text-[15px] font-semibold text-gray-900">Questions</h2>
                  {!published ? (
                    <Link
                      href={`/exams/${exam.id}/generate`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M12 3v3m0 12v3M3 12h3m12 0h3M6.3 6.3l2.1 2.1m7.2 7.2 2.1 2.1m0-11.4-2.1 2.1m-7.2 7.2-2.1 2.1"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                        />
                      </svg>
                      Generate with AI
                    </Link>
                  ) : null}
                </div>

                {qs.length ? (
                  <ul>
                    {qs.map((q, i) => (
                      <QuestionCard
                        key={q.id}
                        examId={exam.id}
                        index={i}
                        locked={published}
                        question={{
                          id: q.id,
                          type: q.type,
                          prompt: q.prompt,
                          choices: q.choices as string[] | null,
                          correct_answer: readAnswerKey(q.question_answers),
                        }}
                      />
                    ))}
                  </ul>
                ) : !published ? (
                  <div className="px-5 pt-6 pb-2 text-center">
                    <p className="text-[15px] font-medium text-gray-900">No questions yet</p>
                    <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
                      Write them one at a time below, or{" "}
                      <Link
                        href={`/exams/${exam.id}/generate`}
                        className="font-medium text-gray-900 underline decoration-gray-300 underline-offset-[3px] hover:decoration-gray-900"
                      >
                        let the AI draft them from a lesson file
                      </Link>{" "}
                      and check them over.
                    </p>
                  </div>
                ) : (
                  <p className="p-6 text-sm text-gray-500">No questions.</p>
                )}

                {!published ? (
                  <div className={qs.length ? "border-t border-gray-100" : ""}>
                    <AddQuestion examId={exam.id} first={!qs.length} />
                  </div>
                ) : null}
              </section>
            </div>

            <div className="space-y-5 lg:sticky lg:top-8">
              {exam.status !== "ARCHIVED" ? (
                <section className="rounded-xl border border-gray-200 bg-white">
                  <h2 className="border-b border-gray-100 px-5 py-3.5 text-[15px] font-semibold text-gray-900">
                    Getting it ready
                  </h2>
                  <ol className="space-y-3 px-5 py-4">
                    {steps.map((s, i) => (
                      <li key={s.label} className="flex items-start gap-3 text-sm">
                        <span
                          aria-hidden
                          className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                            s.done ? "bg-green-700 text-white" : "border border-gray-300 text-gray-500"
                          }`}
                        >
                          {s.done ? (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                              <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : (
                            i + 1
                          )}
                        </span>
                        <span className={`min-w-0 flex-1 ${s.done ? "text-gray-500" : "text-gray-900"}`}>
                          <span className="sr-only">{s.done ? "Done: " : "To do: "}</span>
                          {s.label}
                          {s.href ? (
                            <>
                              {" "}
                              <Link
                                href={s.href}
                                className="font-medium whitespace-nowrap text-gray-900 underline decoration-gray-300 underline-offset-[3px] hover:decoration-gray-900"
                              >
                                {s.action}
                              </Link>
                            </>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}

              <section className="rounded-xl border border-gray-200 bg-white p-5">
                <h2 className="text-[15px] font-semibold text-gray-900">What students see</h2>
                <p className="mt-0.5 mb-4 text-[12.5px] text-gray-500">
                  One question at a time, in a different order for each student.
                </p>
                <ExamPreview
                  questions={qs.map((q) => ({
                    id: q.id,
                    type: q.type,
                    prompt: q.prompt,
                    choices: q.choices as string[] | null,
                  }))}
                  timer={timer}
                  lockdown={lockdown}
                />
              </section>
            </div>
          </div>
        ) : null}

        {tab === "settings" ? (
          <div className="max-w-3xl">
            <SettingsForm
              examId={exam.id}
              title={exam.title}
              subjects={subjects ?? []}
              subjectId={exam.subject_id}
              timer={timer}
              lockdown={lockdown}
            />
          </div>
        ) : null}

        {tab === "students" ? (
          <div className="max-w-3xl space-y-5">
            <ShareLink url={shareUrl} live={published} linkOnly={!useClasses} />

            <ExamWindow
              examId={exam.id}
              opensAt={exam.opens_at}
              closesAt={exam.closes_at}
              isOpen={examIsOpen}
              published={published}
            />

            {useClasses ? (
              <section className="rounded-xl border border-gray-200 bg-white p-5">
                <h2 className="text-[15px] font-semibold text-gray-900">Classes</h2>
                <p className="mt-1 mb-4 text-sm text-gray-500">
                  Everyone in the classes you tick can take it. One exam can go to several classes.
                </p>
                <ClassTargets
                  examId={exam.id}
                  allClasses={myClasses ?? []}
                  selected={selectedClasses}
                  locked={published}
                />
              </section>
            ) : null}

            <Roster examId={exam.id} people={people} linkOnly={!useClasses} />
          </div>
        ) : null}
      </div>
    </ConsoleShell>
  );
}
