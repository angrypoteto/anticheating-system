import { createAdminClient } from "@/lib/supabase/admin";
import { isCorrect, type QuestionType } from "@/lib/grading";
import { readAll } from "@/lib/read-all";

type Row = {
  prompt: string;
  type: QuestionType;
  answered: number;
  correct: number;
  blank: number;
  pct: number | null;
};

/**
 * Which questions the class actually got wrong.
 *
 * Needs the answer key, which is unreadable to everyone including the teacher's
 * own session — that is the point of keeping it in its own table. So this reads
 * with the service role, and the caller must have already established that this
 * exam is theirs.
 *
 * The figure is per question answered, not per student sitting: a question left
 * blank says something different from a question answered wrongly, so blanks are
 * counted separately rather than folded into the percentage.
 */
export async function PerQuestion({ examId }: { examId: string }) {
  const admin = createAdminClient();

  const [{ data: questions }, { data: sessions }] = await Promise.all([
    admin
      .from("questions")
      .select("id, type, prompt, order, question_answers(correct_answer)")
      .eq("exam_id", examId)
      .order("order"),
    admin.from("exam_sessions").select("id").eq("exam_id", examId),
  ]);

  const sessionIds = (sessions ?? []).map((s) => s.id);
  if (!questions?.length || !sessionIds.length) {
    return (
      <p className="p-6 text-sm text-gray-500 dark:text-gray-400">
        Nothing to analyse until somebody has answered.
      </p>
    );
  }

  // Fifty students on a twenty-five question paper is 1,250 answers, past the
  // 1,000-row reply cap. Reading it in one go reported percentages over the
  // first thousand and called them the class's.
  const { rows: answers } = await readAll<{ question_id: string; response: unknown }>(
    (from, to) =>
      admin
        .from("answers")
        .select("question_id, response")
        .in("session_id", sessionIds)
        .range(from, to),
  );

  const rows: Row[] = questions.map((q) => {
    const embed = q.question_answers as
      | { correct_answer: unknown }
      | { correct_answer: unknown }[]
      | null;
    const key = (Array.isArray(embed) ? embed[0] : embed)?.correct_answer;

    const given = answers.filter((a) => a.question_id === q.id);
    const correct = given.filter((a) =>
      isCorrect(q.type as QuestionType, a.response, key),
    ).length;

    return {
      prompt: q.prompt,
      type: q.type as QuestionType,
      answered: given.length,
      correct,
      blank: sessionIds.length - given.length,
      pct: given.length ? Math.round((correct / given.length) * 100) : null,
    };
  });

  // Hardest first: that is the list a teacher acts on.
  const ranked = [...rows].sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
          <tr>
            <th className="px-6 py-3 font-medium">Question</th>
            <th className="px-6 py-3 font-medium">Correct</th>
            <th className="px-6 py-3 font-medium">Answered</th>
            <th className="px-6 py-3 font-medium">Left blank</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r, i) => (
            <tr key={i} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
              <td className="max-w-md px-6 py-3">
                <p className="truncate text-gray-900 dark:text-gray-100" title={r.prompt}>
                  {r.prompt}
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {r.type === "MULTIPLE_CHOICE" ? "multiple choice" : "identification"}
                </p>
              </td>
              <td className="px-6 py-3">
                {r.pct == null ? (
                  <span className="text-gray-400 dark:text-gray-600">—</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-10 shrink-0 tabular-nums ${
                        r.pct < 50
                          ? "font-medium text-red-700 dark:text-red-400"
                          : r.pct < 75
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {r.pct}%
                    </span>
                    <span
                      aria-hidden
                      className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
                    >
                      <span
                        className={`block h-full rounded-full ${
                          r.pct < 50
                            ? "bg-red-600 dark:bg-red-500"
                            : r.pct < 75
                              ? "bg-amber-500"
                              : "bg-green-600 dark:bg-green-500"
                        }`}
                        style={{ width: `${r.pct}%` }}
                      />
                    </span>
                  </div>
                )}
              </td>
              <td className="px-6 py-3 tabular-nums text-gray-600 dark:text-gray-400">
                {r.correct}/{r.answered}
              </td>
              <td className="px-6 py-3 tabular-nums text-gray-600 dark:text-gray-400">
                {r.blank || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
