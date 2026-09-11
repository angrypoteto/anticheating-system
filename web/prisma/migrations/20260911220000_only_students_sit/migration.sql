-- Only students sit exams.
--
-- A teacher who opened their own paper to see it as a student got a real
-- sitting: it counted in "Sitting now", its flags reached the monitor, it
-- dragged the class averages about, and — one sitting per person per exam — it
-- locked them out after the first go, so trying again meant asking somebody to
-- "let them back in". Nine such sittings existed by 11 September, all staff
-- testing their own papers.
--
-- The way in was the owner's own policy: exam_sessions_instructor lets whoever
-- owns an exam write its sittings, and that included writing one for
-- themselves. Rather than narrow every policy that can insert, the table now
-- refuses a sitting for anybody who is not a student, whoever is inserting it.
-- Staff try a paper in demo mode, which saves nothing.

CREATE OR REPLACE FUNCTION private.only_students_sit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = NEW.student_id AND u.role = 'STUDENT'::"Role"
  ) THEN
    RAISE EXCEPTION 'Only students sit exams. Try it in demo mode instead.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS exam_sessions_students_only ON public.exam_sessions;
CREATE TRIGGER exam_sessions_students_only
  BEFORE INSERT OR UPDATE OF student_id ON public.exam_sessions
  FOR EACH ROW EXECUTE FUNCTION private.only_students_sit();
