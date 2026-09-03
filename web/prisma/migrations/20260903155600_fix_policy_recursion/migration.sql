-- users_select_instructor subqueried sections, sections_select_member subqueried users:
-- each policy triggered the other's RLS check, so any read recursed. Cross-table lookups
-- now go through SECURITY DEFINER helpers, which bypass RLS and break the cycle.

CREATE OR REPLACE FUNCTION private.my_section_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT section_id FROM public.users WHERE id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION private.instructs_section(section_uuid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sections
    WHERE id = section_uuid AND instructor_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION private.my_section_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.instructs_section(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.my_section_id() TO authenticated;
GRANT EXECUTE ON FUNCTION private.instructs_section(UUID) TO authenticated;

DROP POLICY IF EXISTS users_select_instructor ON public.users;
CREATE POLICY users_select_instructor ON public.users
  FOR SELECT TO authenticated
  USING (private.is_instructor() AND private.instructs_section(section_id));

DROP POLICY IF EXISTS sections_select_member ON public.sections;
CREATE POLICY sections_select_member ON public.sections
  FOR SELECT TO authenticated
  USING (instructor_id = (SELECT auth.uid()) OR id = private.my_section_id());

DROP POLICY IF EXISTS exams_select_student ON public.exams;
CREATE POLICY exams_select_student ON public.exams
  FOR SELECT TO authenticated
  USING (status = 'PUBLISHED'::"ExamStatus" AND section_id = private.my_section_id());

DROP POLICY IF EXISTS exams_instructor_all ON public.exams;
CREATE POLICY exams_instructor_all ON public.exams
  FOR ALL TO authenticated
  USING (private.instructs_section(section_id))
  WITH CHECK (private.instructs_section(section_id));

DROP POLICY IF EXISTS questions_select_student ON public.questions;
CREATE POLICY questions_select_student ON public.questions
  FOR SELECT TO authenticated
  USING (
    exam_id IN (
      SELECT id FROM public.exams
      WHERE status = 'PUBLISHED'::"ExamStatus" AND section_id = private.my_section_id()
    )
  );
