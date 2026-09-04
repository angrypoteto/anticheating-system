-- With classes off, the link is the only way in.
--
-- Switching classes off used to mean "every published exam reaches every
-- student", which was the wrong reading of what turning them off is for. It
-- makes the share link meaningless: a teacher sends one student the quiz and
-- that student's dashboard lists the midterm too, because nothing else was
-- deciding who sits what.
--
-- So the two settings now say something coherent together:
--
--   classes ON  - an exam reaches the classes it was set for, plus anyone
--                 holding its link
--   classes OFF - there are no classes, so an exam reaches exactly the people
--                 holding its link, and nobody else
--
-- Which is the Google Forms shape the link was built for.

CREATE OR REPLACE FUNCTION private.exam_reaches_my_section(exam_uuid uuid)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT CASE
    -- No classes means no class can reach anybody. The link is handled by
    -- can_sit_exam(), which is the only caller that matters.
    WHEN NOT private.classes_enabled() THEN FALSE
    ELSE EXISTS (
      SELECT 1 FROM public.exam_sections es
      WHERE es.exam_id = exam_uuid
        AND es.section_id IN (SELECT private.my_section_ids())
    )
  END;
$fn$;

CREATE OR REPLACE FUNCTION private.can_sit_exam(exam_uuid uuid)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT private.is_active()
     AND (
       private.exam_reaches_my_section(exam_uuid)
       OR EXISTS (
         SELECT 1 FROM public.exam_access a
         WHERE a.exam_id = exam_uuid AND a.student_id = (SELECT auth.uid())
       )
       -- Somebody already sitting the paper keeps it. Turning classes off, or
       -- revoking a link, must not empty the screen of a student mid-exam and
       -- lose their answers.
       OR EXISTS (
         SELECT 1 FROM public.exam_sessions s
         WHERE s.exam_id = exam_uuid AND s.student_id = (SELECT auth.uid())
       )
     );
$fn$;
