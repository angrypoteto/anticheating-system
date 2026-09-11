import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseLockdown, parseTimer } from "@/lib/exam-config";
import { choiceOrderSeed, questionOrderSeed, seededShuffle } from "@/lib/shuffle";
import { ExamRunner, type RunnerQuestion } from "@/app/exam/[id]/runner";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("exams").select("title").eq("id", id).maybeSingle();
  return { title: data?.title ? `${data.title} (demo)` : "Demo" };
}

/**
 * The paper as a student sits it, for the person who wrote it.
 *
 * The same runner, the same lockdown, the same timer, warnings and screen-share
 * step — with every write taken out. Nothing here creates a sitting (the
 * database would refuse one for staff anyway), so there is nothing to undo and
 * nobody to ask to let you back in: reload, and it starts again.
 *
 * Works on drafts too. The point is to try the paper before students do.
 */
export default async function DemoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("INSTRUCTOR", "ADMIN");
  const { id } = await params;
  const supabase = await createClient();

  // Read through the teacher's own session: only somebody who may manage the
  // exam can load it, and so only they can try it.
  const { data: exam } = await supabase
    .from("exams")
    .select("id, title, timer_config, lockdown_config")
    .eq("id", id)
    .maybeSingle();
  if (!exam) notFound();

  const { data: rows } = await supabase
    .from("questions")
    .select("id, type, prompt, choices")
    .eq("exam_id", id)
    .order("order");

  // A fresh shuffle every time, as a new student would get. Students' order is
  // seeded from their sitting; a demo has no sitting, so it gets a throwaway id.
  const run = crypto.randomUUID();
  const questions: RunnerQuestion[] = seededShuffle(rows ?? [], questionOrderSeed(run)).map(
    (q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      choices: q.choices ? seededShuffle(q.choices as string[], choiceOrderSeed(run, q.id)) : null,
    }),
  );

  return (
    <ExamRunner
      sessionId={run}
      examTitle={exam.title}
      questions={questions}
      timer={parseTimer(exam.timer_config)}
      lockdown={parseLockdown(exam.lockdown_config)}
      startedAt={new Date().toISOString()}
      savedAnswers={{}}
      initialStrikes={0}
      demo={{ examId: exam.id }}
    />
  );
}
