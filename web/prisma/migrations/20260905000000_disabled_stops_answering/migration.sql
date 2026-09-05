-- Disabling an account has to stop the answering too.
--
-- is_active() already gates starting a sitting, and a disabled student loses
-- sight of every exam. But the answer policies only ever asked three things —
-- is this your session, is it in progress, is the exam open — so somebody
-- disabled *during* a paper could carry on writing into the session they
-- already had. Which is exactly the moment a teacher reaches for the button.
--
-- Flags are deliberately left alone: those are the system recording what
-- happened, and there is no reason to lose evidence about someone who has just
-- been shut out.
DROP POLICY IF EXISTS answers_insert_own ON public.answers;
CREATE POLICY answers_insert_own ON public.answers
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_active()
    AND session_id IN (
      SELECT s.id FROM public.exam_sessions s
      WHERE s.student_id = (SELECT auth.uid())
        AND s.status = 'IN_PROGRESS'::"SessionStatus"
        AND private.exam_is_open(s.exam_id)
    )
  );

DROP POLICY IF EXISTS answers_update_own ON public.answers;
CREATE POLICY answers_update_own ON public.answers
  FOR UPDATE TO authenticated
  USING (
    private.is_active()
    AND session_id IN (
      SELECT s.id FROM public.exam_sessions s
      WHERE s.student_id = (SELECT auth.uid())
        AND s.status = 'IN_PROGRESS'::"SessionStatus"
    )
  )
  WITH CHECK (
    private.is_active()
    AND session_id IN (
      SELECT s.id FROM public.exam_sessions s
      WHERE s.student_id = (SELECT auth.uid())
        AND s.status = 'IN_PROGRESS'::"SessionStatus"
        AND private.exam_is_open(s.exam_id)
    )
  );
