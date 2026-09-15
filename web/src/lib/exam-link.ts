import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { parseTimer } from "@/lib/exam-config";

export type LinkedExam = {
  title: string;
  subject: string | null;
  questions: number;
  minutes: number;
};

/**
 * What a share link points at, told to someone who is not signed in yet.
 *
 * A link pasted into a chat is fetched by the chat app to build its preview,
 * and that fetch is never signed in — so without this the preview could only
 * ever say the domain. The link is the teacher's invitation to anyone holding
 * it, so the paper's name and size are no secret from them; its questions are,
 * and nothing here reads them. A draft or archived paper says nothing at all.
 */
export async function examForLink(token: string): Promise<LinkedExam | null> {
  const t = token.trim();
  if (!t || t.length > 64) return null;

  const admin = createAdminClient();
  const { data: exam } = await admin
    .from("exams")
    .select("id, title, timer_config, subjects(name)")
    .eq("share_token", t)
    .eq("status", "PUBLISHED")
    .maybeSingle();
  if (!exam) return null;

  const { count } = await admin
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", exam.id);

  const embed = exam.subjects as { name: string } | { name: string }[] | null;
  return {
    title: exam.title,
    subject: (Array.isArray(embed) ? embed[0] : embed)?.name ?? null,
    questions: count ?? 0,
    minutes: parseTimer(exam.timer_config).totalMinutes,
  };
}

/** "Data Structures, 20 questions, 30 minutes" */
export function describeLinkedExam(e: LinkedExam): string {
  return [
    e.subject,
    `${e.questions} question${e.questions === 1 ? "" : "s"}`,
    e.minutes ? `${e.minutes} minutes` : "no time limit",
  ]
    .filter(Boolean)
    .join(", ");
}
