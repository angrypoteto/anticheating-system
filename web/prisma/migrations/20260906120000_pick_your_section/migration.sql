-- Choosing your class from a list, instead of typing a code off a whiteboard.
--
-- Joining meant entering a six-character code. That works when a teacher is
-- stood in front of you saying it out loud, and not at all when a student signs
-- up at home on a Sunday — which, since signing in with Google made an account
-- one click away, is when most of them do it. A student knows which section
-- they are in. They should be able to say so.
--
-- The list is the admin's: creating a section is already an admin-only action
-- (requireRole("ADMIN") in the console, and no INSERT policy for anybody else),
-- so what a student may pick is exactly what an admin has entered. Nothing here
-- changes that — it only lets a student read the list and put themselves on one
-- of its rows.
--
-- Which is a deliberate loosening, and worth being plain about: with self-join
-- on, a student may enrol in any class an admin has created, not only their
-- own. That was already true of the code — a code is one WhatsApp message from
-- being everybody's — and the switch that turns self-join off is the answer for
-- a school that wants the roll under its own control.

-- The one place the two settings that govern self-joining are read together.
-- classes_enabled decides whether classes exist at all; allow_class_self_join
-- decides who does the enrolling. Joining needs both, and join_class() asked
-- only the second.
CREATE OR REPLACE FUNCTION private.self_join_open()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(classes_enabled, TRUE) AND COALESCE(allow_class_self_join, TRUE)
  FROM public.system_settings WHERE id;
$fn$;

/**
 * The classes this student could join, right now.
 *
 * Students cannot read the sections table — the policy shows them only the
 * classes they are already in, which is no use for choosing one. This answers
 * the narrower question instead: what an admin has created, minus what the
 * asker is already on, and nothing at all when the school assigns classes
 * itself.
 */
CREATE OR REPLACE FUNCTION public.selectable_sections()
RETURNS TABLE (id uuid, subject text, name text, instructor text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT s.id, s.subject, s.name, u.full_name
  FROM public.sections s
  LEFT JOIN public.users u ON u.id = s.instructor_id
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND private.self_join_open()
    AND NOT EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.section_id = s.id
        AND e.student_id = (SELECT auth.uid())
    )
  ORDER BY s.subject NULLS LAST, s.name;
$fn$;

/**
 * Put the caller on a class they picked from that list.
 *
 * The same guards join_class() applies to a code, because they are guards about
 * the joiner and the school's settings rather than about how the class was
 * named. There is still no student INSERT policy on enrollments: this function
 * and join_class() remain the only two ways in.
 */
CREATE OR REPLACE FUNCTION public.join_section(p_section_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  caller UUID := (SELECT auth.uid());
BEGIN
  IF caller IS NULL OR NOT private.is_active() THEN
    RAISE EXCEPTION 'Your account is not active.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT private.self_join_open() THEN
    RAISE EXCEPTION 'Your school assigns classes. Ask your teacher to add you.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sections WHERE id = p_section_id) THEN
    RAISE EXCEPTION 'That class no longer exists.' USING ERRCODE = 'no_data_found';
  END IF;

  -- Already on it is not a failure; it is the state they were asking for.
  INSERT INTO public.enrollments (student_id, section_id)
  VALUES (caller, p_section_id)
  ON CONFLICT DO NOTHING;

  RETURN p_section_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.selectable_sections() FROM public, anon;
REVOKE ALL ON FUNCTION public.join_section(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.selectable_sections() TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_section(uuid) TO authenticated;
