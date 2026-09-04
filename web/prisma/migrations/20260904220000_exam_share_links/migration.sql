-- A shareable link for an exam, the way a Google Form has one.
--
-- The link is not just a URL to the exam: opening it is what grants a student
-- access. Without that it would only work for people already enrolled, which is
-- the opposite of what a link is for — you send it to whoever should sit the
-- paper. Enrolment and the link are two independent ways in, so sending a link
-- to someone outside the class gives them that one exam and nothing else.

-- 16 URL-safe characters from 12 random bytes. translate() maps + and / and
-- drops = (no target character), so the token never needs escaping.
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS share_token TEXT;

UPDATE public.exams
   SET share_token = translate(encode(gen_random_bytes(12), 'base64'), '+/=', '-_')
 WHERE share_token IS NULL;

ALTER TABLE public.exams
  ALTER COLUMN share_token SET DEFAULT translate(encode(gen_random_bytes(12), 'base64'), '+/=', '-_');
ALTER TABLE public.exams ALTER COLUMN share_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS exams_share_token_key ON public.exams (share_token);

-- Who was let in by a link. Separate from enrollments so that a link to one
-- exam never quietly adds someone to a class and all its other papers.
CREATE TABLE IF NOT EXISTS public.exam_access (
  exam_id    UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (exam_id, student_id)
);

CREATE INDEX IF NOT EXISTS exam_access_student_idx ON public.exam_access (student_id);

ALTER TABLE public.exam_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_access_admin_all ON public.exam_access;
CREATE POLICY exam_access_admin_all ON public.exam_access
  FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

DROP POLICY IF EXISTS exam_access_select_own ON public.exam_access;
CREATE POLICY exam_access_select_own ON public.exam_access
  FOR SELECT TO authenticated USING (student_id = (SELECT auth.uid()));

-- A teacher sees, and can revoke, who they let into their own exam. There is
-- deliberately no student INSERT policy: open_exam_link() is the only way in,
-- so holding the token is the only thing that grants access.
DROP POLICY IF EXISTS exam_access_instructor ON public.exam_access;
CREATE POLICY exam_access_instructor ON public.exam_access
  FOR ALL TO authenticated
  USING (private.owns_exam(exam_id)) WITH CHECK (private.owns_exam(exam_id));

-- The single answer to "may this person sit this exam": their class was given
-- it, or they followed the link.
CREATE OR REPLACE FUNCTION private.can_sit_exam(exam_uuid uuid)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT private.exam_reaches_my_section(exam_uuid)
      OR EXISTS (
        SELECT 1 FROM public.exam_access a
        WHERE a.exam_id = exam_uuid AND a.student_id = (SELECT auth.uid())
      );
$fn$;

-- Redeem a share link. SECURITY DEFINER because the caller cannot yet see the
-- exam it names — that is the point.
CREATE OR REPLACE FUNCTION public.open_exam_link(token TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  found  public.exams%ROWTYPE;
  caller UUID := (SELECT auth.uid());
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO found FROM public.exams WHERE share_token = btrim(token);

  IF found.id IS NULL THEN
    RAISE EXCEPTION 'That link does not match any exam.' USING ERRCODE = 'no_data_found';
  END IF;

  -- A draft is not ready to be sat, and an archived one is finished. Say so
  -- rather than letting somebody in to an empty paper.
  IF found.status <> 'PUBLISHED'::"ExamStatus" THEN
    RAISE EXCEPTION 'That exam is not open.' USING ERRCODE = 'no_data_found';
  END IF;

  -- Teachers and admins already have their own way in; only a student needs
  -- the grant, and only a student should be recorded as having used the link.
  IF (SELECT private.current_role_of()) = 'STUDENT'::"Role" THEN
    INSERT INTO public.exam_access (exam_id, student_id)
    VALUES (found.id, caller)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN found.id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.open_exam_link(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_exam_link(TEXT) TO authenticated;

-- Both student-facing policies now ask the same question.
DROP POLICY IF EXISTS exams_select_student ON public.exams;
CREATE POLICY exams_select_student ON public.exams
  FOR SELECT TO authenticated
  USING (status = 'PUBLISHED'::"ExamStatus" AND private.can_sit_exam(id));

DROP POLICY IF EXISTS questions_select_student ON public.questions;
CREATE POLICY questions_select_student ON public.questions
  FOR SELECT TO authenticated
  USING (
    exam_id IN (
      SELECT e.id FROM public.exams e
      WHERE e.status = 'PUBLISHED'::"ExamStatus" AND private.can_sit_exam(e.id)
    )
  );

-- Starting a sitting was only checked against "is this row mine", which let a
-- student open a session on any exam id they could guess. Tie it to the same
-- question as reading the paper.
DROP POLICY IF EXISTS exam_sessions_insert_own ON public.exam_sessions;
CREATE POLICY exam_sessions_insert_own ON public.exam_sessions
  FOR INSERT TO authenticated
  WITH CHECK (student_id = (SELECT auth.uid()) AND private.can_sit_exam(exam_id));
