-- Deleting an exam, and deleting an account.
--
-- Neither could be done at all. There was a deleteExam() in the codebase wired
-- to no button, and it would not have worked if there had been one: it removed
-- the questions and the exam and nothing else, so an exam anybody had sat
-- failed on the first foreign key — and a published exam failed sooner than
-- that, because its questions are frozen against editing.
--
-- Both live here rather than in a server action because both are several
-- deletes that have to happen together. Half a deleted exam is worse than an
-- undeleted one: the run that removed the sittings and then failed on the
-- questions has thrown away the results and kept the paper.
--
-- Authorisation is inside the functions for the same reason it is inside
-- join_section(): a caller should not be able to reach the rows by any route
-- that skips the check.

-- Who may take an exam apart: whoever may run it.
CREATE OR REPLACE FUNCTION private.may_manage_exam(p_exam_id uuid)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT private.is_admin() OR private.owns_exam(p_exam_id);
$fn$;

/**
 * What deleting this exam would destroy.
 *
 * Asked before the button is offered a second time, so "delete this exam" can
 * say "and the 47 sittings on it" — which is the fact that ought to change
 * somebody's mind, and the one a confirmation dialogue usually leaves out.
 */
CREATE OR REPLACE FUNCTION public.exam_delete_summary(p_exam_id uuid)
RETURNS TABLE (title text, status text, questions integer, sittings integer, answers integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT private.may_manage_exam(p_exam_id) THEN
    RAISE EXCEPTION 'That exam is not yours.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    e.title,
    e.status::text,
    (SELECT count(*)::int FROM public.questions q WHERE q.exam_id = e.id),
    (SELECT count(*)::int FROM public.exam_sessions s WHERE s.exam_id = e.id),
    (SELECT count(*)::int
       FROM public.answers a
       JOIN public.exam_sessions s ON s.id = a.session_id
      WHERE s.exam_id = e.id)
  FROM public.exams e
  WHERE e.id = p_exam_id;
END;
$fn$;

/** The exam and everything hanging off it, in one transaction. */
CREATE OR REPLACE FUNCTION public.delete_exam(p_exam_id uuid)
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_title TEXT;
BEGIN
  SELECT e.title INTO v_title FROM public.exams e WHERE e.id = p_exam_id;

  -- Asked in this order so a second press says what actually happened. The
  -- other way round, an exam that had just been deleted came back as "not
  -- yours", which is both untrue and alarming.
  IF v_title IS NULL THEN
    RAISE EXCEPTION 'That exam has already been deleted.' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT private.may_manage_exam(p_exam_id) THEN
    RAISE EXCEPTION 'That exam is not yours.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A published exam's questions are frozen, which is right while the paper
  -- exists and merely in the way when it is being removed whole.
  UPDATE public.exams SET status = 'ARCHIVED'::"ExamStatus"
   WHERE id = p_exam_id AND status <> 'ARCHIVED'::"ExamStatus";

  DELETE FROM public.flags f
   USING public.exam_sessions s
   WHERE f.session_id = s.id AND s.exam_id = p_exam_id;

  DELETE FROM public.answers a
   USING public.exam_sessions s
   WHERE a.session_id = s.id AND s.exam_id = p_exam_id;

  DELETE FROM public.exam_sessions WHERE exam_id = p_exam_id;

  DELETE FROM public.question_answers qa
   USING public.questions q
   WHERE qa.question_id = q.id AND q.exam_id = p_exam_id;

  DELETE FROM public.questions WHERE exam_id = p_exam_id;
  DELETE FROM public.lesson_files WHERE exam_id = p_exam_id;
  DELETE FROM public.exam_access WHERE exam_id = p_exam_id;
  DELETE FROM public.exam_sections WHERE exam_id = p_exam_id;
  DELETE FROM public.exams WHERE id = p_exam_id;

  RETURN v_title;
END;
$fn$;

/**
 * What deleting this account would destroy, and whether it can be.
 *
 * `blocked_by` is the point: an account that wrote exams or teaches a class
 * cannot simply be removed, because the exams reference it and would go with
 * it. Disabling exists for that, and says so.
 */
CREATE OR REPLACE FUNCTION public.account_delete_summary(p_user_id uuid)
RETURNS TABLE (
  email text,
  role text,
  exams integer,
  sections integer,
  sittings integer,
  blocked_by text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_exams int;
  v_sections int;
  v_admins int;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Only an administrator may do that.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*)::int INTO v_exams FROM public.exams e WHERE e.created_by_id = p_user_id;
  SELECT count(*)::int INTO v_sections FROM public.sections s WHERE s.instructor_id = p_user_id;
  -- Aliased: the OUT parameters of this function are named `role` and `email`,
  -- so an unqualified column of the same name is ambiguous and the whole
  -- function fails at run time with nothing useful to say about which one.
  SELECT count(*)::int INTO v_admins
    FROM public.users au
   WHERE au.role = 'ADMIN'::"Role" AND au.status = 'ACTIVE'::"UserStatus";

  RETURN QUERY
  SELECT
    u.email,
    u.role::text,
    v_exams,
    v_sections,
    (SELECT count(*)::int FROM public.exam_sessions s WHERE s.student_id = u.id),
    CASE
      WHEN u.id = (SELECT auth.uid()) THEN 'self'
      WHEN u.role = 'ADMIN'::"Role" AND v_admins <= 1 THEN 'last_admin'
      WHEN v_exams > 0 THEN 'exams'
      WHEN v_sections > 0 THEN 'sections'
      ELSE NULL
    END
  FROM public.users u
  WHERE u.id = p_user_id;
END;
$fn$;

/**
 * Everything in this schema that points at an account, cleared.
 *
 * Deleting the login itself is the auth API's job and happens after this. What
 * stopped it before was the references: sitting an exam writes an audit row
 * naming the student as the actor, and audit_log.actor_id has no cascade, so
 * the delete failed with "Database error deleting user" and nothing to say why.
 *
 * Records that outlive the person are kept and pointed elsewhere rather than
 * destroyed: a flag stays on the sitting it belongs to, with the teacher who
 * cleared it forgotten; a provider key keeps working, credited to whoever
 * removed the account.
 */
CREATE OR REPLACE FUNCTION public.purge_account(p_user_id uuid)
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_email TEXT;
  v_blocked TEXT;
  v_actor UUID := (SELECT auth.uid());
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Only an administrator may do that.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT s.email, s.blocked_by INTO v_email, v_blocked
    FROM public.account_delete_summary(p_user_id) s;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'That account has already been deleted.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_blocked = 'self' THEN
    RAISE EXCEPTION 'You cannot delete the account you are signed in with.'
      USING ERRCODE = 'insufficient_privilege';
  ELSIF v_blocked = 'last_admin' THEN
    RAISE EXCEPTION 'This is the only active administrator. Make somebody else an administrator first.'
      USING ERRCODE = 'insufficient_privilege';
  ELSIF v_blocked = 'exams' THEN
    RAISE EXCEPTION 'This account wrote exams. Delete those first, or disable the account instead.'
      USING ERRCODE = 'foreign_key_violation';
  ELSIF v_blocked = 'sections' THEN
    RAISE EXCEPTION 'This account teaches a class. Assign somebody else to it first, or disable the account instead.'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  DELETE FROM public.flags f
   USING public.exam_sessions s
   WHERE f.session_id = s.id AND s.student_id = p_user_id;

  DELETE FROM public.answers a
   USING public.exam_sessions s
   WHERE a.session_id = s.id AND s.student_id = p_user_id;

  DELETE FROM public.exam_sessions WHERE student_id = p_user_id;
  DELETE FROM public.enrollments WHERE student_id = p_user_id;
  DELETE FROM public.exam_access WHERE student_id = p_user_id;
  DELETE FROM public.generation_progress WHERE owner_id = p_user_id;
  DELETE FROM public.audit_log WHERE actor_id = p_user_id;

  UPDATE public.flags SET resolved_by_id = NULL WHERE resolved_by_id = p_user_id;
  UPDATE public.ai_provider_keys SET added_by_id = v_actor WHERE added_by_id = p_user_id;

  RETURN v_email;
END;
$fn$;

REVOKE ALL ON FUNCTION public.exam_delete_summary(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.delete_exam(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.account_delete_summary(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.purge_account(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.exam_delete_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_exam(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.account_delete_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_account(uuid) TO authenticated;
