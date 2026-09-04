-- Classes become optional.
--
-- Organising exams by subject is right for a school running a timetable, and
-- overhead for someone who just wants to set an exam, watch it live and read
-- the results. Rather than choose, the whole idea is now a switch: when it is
-- off, classes stop existing as far as instructors and students are concerned,
-- and every published exam simply reaches every student.
--
-- Nothing is deleted when it is off. Classes, enrolments and join codes stay
-- exactly as they are and come back the moment it is switched on again.

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS classes_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- With classes off there is no class to build an exam for.
ALTER TABLE public.exams ALTER COLUMN section_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION private.classes_enabled()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE((SELECT classes_enabled FROM public.system_settings WHERE id), TRUE);
$fn$;

-- The one place student visibility is decided. Switching classes off makes
-- every published exam reach everybody, which is the whole meaning of the
-- setting; both the exams policy and the questions policy read this, so they
-- cannot drift apart.
CREATE OR REPLACE FUNCTION private.exam_reaches_my_section(exam_uuid uuid)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT CASE
    WHEN NOT private.classes_enabled() THEN TRUE
    ELSE EXISTS (
      SELECT 1 FROM public.exam_sections es
      WHERE es.exam_id = exam_uuid
        AND es.section_id IN (SELECT private.my_section_ids())
    )
  END;
$fn$;

-- Ownership normally comes from teaching the class the exam belongs to. With
-- classes off there is no such link, so it falls back to who wrote it — which
-- also keeps an exam authored while classes were off in its author's hands.
CREATE OR REPLACE FUNCTION private.owns_exam(exam_uuid uuid)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.exams e
    LEFT JOIN public.sections s ON s.id = e.section_id
    WHERE e.id = exam_uuid
      AND (
        s.instructor_id = (SELECT auth.uid())
        OR (NOT private.classes_enabled() AND e.created_by_id = (SELECT auth.uid()))
      )
  );
$fn$;

-- This policy tests the class directly rather than going through owns_exam.
DROP POLICY IF EXISTS exams_instructor_all ON public.exams;
CREATE POLICY exams_instructor_all ON public.exams
  FOR ALL TO authenticated
  USING (
    private.instructs_section(section_id)
    OR (NOT private.classes_enabled() AND created_by_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    private.instructs_section(section_id)
    OR (NOT private.classes_enabled() AND created_by_id = (SELECT auth.uid()))
  );

-- Reading results means reading names. With classes on, a teacher sees only
-- the students they teach; with classes off there is no "their students", so
-- the roll is every student. That is a real widening, and the honest cost of
-- turning the feature off.
DROP POLICY IF EXISTS users_select_instructor ON public.users;
CREATE POLICY users_select_instructor ON public.users
  FOR SELECT TO authenticated
  USING (
    private.is_instructor()
    AND (
      private.teaches_student(id)
      OR (NOT private.classes_enabled() AND role = 'STUDENT'::"Role")
    )
  );
