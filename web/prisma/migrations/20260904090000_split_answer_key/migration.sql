-- Students must read questions to sit an exam, but RLS is row-level and both students
-- and instructors are the same `authenticated` role, so no policy or column grant can
-- hide correct_answer while questions stay one table. Verified: a student could
-- SELECT prompt, correct_answer and get the whole key.
--
-- Answers move to their own table with no student-facing policy whatsoever.
CREATE TABLE public.question_answers (
  question_id    UUID PRIMARY KEY REFERENCES public.questions(id) ON DELETE CASCADE,
  correct_answer JSONB NOT NULL,
  created_at     TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

INSERT INTO public.question_answers (question_id, correct_answer)
SELECT id, correct_answer FROM public.questions;

ALTER TABLE public.questions DROP COLUMN correct_answer;

ALTER TABLE public.question_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY question_answers_instructor_all ON public.question_answers
  FOR ALL TO authenticated
  USING (
    question_id IN (SELECT q.id FROM public.questions q WHERE private.owns_exam(q.exam_id))
  )
  WITH CHECK (
    question_id IN (SELECT q.id FROM public.questions q WHERE private.owns_exam(q.exam_id))
  );

CREATE POLICY question_answers_admin_all ON public.question_answers
  FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());
