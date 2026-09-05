-- A teacher keeps the exams they wrote, whatever the classes setting says.
--
-- Ownership was "you teach the class this exam belongs to, OR classes are off
-- and you wrote it". An exam written while classes were off has no class, so
-- the moment an administrator switched classes on, every such exam vanished
-- from the teacher who made it: the exam page 404'd, the monitor was
-- unreachable, and the questions could not be edited. An admin could still see
-- it, which makes the disappearance look stranger rather than better.
--
-- Authorship is not conditional on a setting. It counts either way, and the
-- class check stays for the ordinary case of a colleague teaching the class an
-- exam was written for.
CREATE OR REPLACE FUNCTION private.owns_exam(exam_uuid uuid)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.exams e
    LEFT JOIN public.sections s ON s.id = e.section_id
    WHERE e.id = exam_uuid
      AND (
        s.instructor_id = (SELECT auth.uid())
        OR e.created_by_id = (SELECT auth.uid())
      )
  );
$fn$;

DROP POLICY IF EXISTS exams_instructor_all ON public.exams;
CREATE POLICY exams_instructor_all ON public.exams
  FOR ALL TO authenticated
  USING (
    private.instructs_section(section_id)
    OR created_by_id = (SELECT auth.uid())
  )
  WITH CHECK (
    private.instructs_section(section_id)
    OR created_by_id = (SELECT auth.uid())
  );
