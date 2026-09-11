import "server-only";

export type QuestionType = "MULTIPLE_CHOICE" | "IDENTIFICATION";

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * A response is correct when it matches the stored key. Multiple choice stores the
 * choice *text* (not an index, since display order is shuffled per student);
 * identification stores a list of accepted spellings.
 */
export function isCorrect(
  type: QuestionType,
  response: unknown,
  correctAnswer: unknown,
): boolean {
  if (response == null) return false;

  if (type === "MULTIPLE_CHOICE") {
    return (
      typeof response === "string" &&
      typeof correctAnswer === "string" &&
      normalize(response) === normalize(correctAnswer)
    );
  }

  if (typeof response !== "string") return false;
  const accepted = Array.isArray(correctAnswer)
    ? correctAnswer
    : [correctAnswer];
  return accepted.some(
    (a) => typeof a === "string" && normalize(a) === normalize(response),
  );
}

/**
 * Whether an answer counts, all things considered: the teacher's own mark when
 * they have made one, the key otherwise. Every score in the product goes
 * through this, so a mark a teacher sets is the mark everything reports.
 */
export function counts(
  type: QuestionType,
  response: unknown,
  correctAnswer: unknown,
  teacherMark: boolean | null | undefined,
): boolean {
  if (teacherMark === true || teacherMark === false) return teacherMark;
  return isCorrect(type, response, correctAnswer);
}

/** Percentage 0-100, rounded to two decimals. An exam with no questions scores 0. */
export function scorePercentage(correct: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((correct / total) * 10000) / 100;
}
