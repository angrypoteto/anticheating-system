-- A disabled account must be disabled in the database, not just in the pages.
--
-- status = 'DISABLED' was only ever checked by requireRole(), which redirects a
-- browser. It did nothing about the session token that browser holds: signing in
-- still worked and the API still answered, so a disabled student could read
-- published exams directly.
--
-- That was survivable while accounts could only be made by an admin. It is not
-- survivable now that registration is open for Google sign-in, because DISABLED
-- is exactly what the registration gate hands to someone who should not be here.

CREATE OR REPLACE FUNCTION private.is_active()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid()) AND status = 'ACTIVE'::"UserStatus"
  );
$fn$;

-- Every student-facing route into exam content already asks this one question,
-- so it is the one place the check has to go: reading an exam, reading its
-- questions, and starting a sitting all pass through here.
CREATE OR REPLACE FUNCTION private.can_sit_exam(exam_uuid uuid)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT private.is_active()
     AND (
       private.exam_reaches_my_section(exam_uuid)
       OR EXISTS (
         SELECT 1 FROM public.exam_access a
         WHERE a.exam_id = exam_uuid AND a.student_id = (SELECT auth.uid())
       )
     );
$fn$;

-- A disabled account is not an admin or an instructor either. Both helpers feed
-- the staff policies on every table, so this closes the same hole for anyone
-- whose account is turned off while they are signed in.
CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid())
      AND status = 'ACTIVE'::"UserStatus"
      AND role = 'ADMIN'::"Role"
  );
$fn$;

CREATE OR REPLACE FUNCTION private.is_instructor()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid())
      AND status = 'ACTIVE'::"UserStatus"
      AND role = 'INSTRUCTOR'::"Role"
  );
$fn$;

-- And a disabled account cannot let itself into anything new.
CREATE OR REPLACE FUNCTION public.join_class(code TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  target UUID;
  caller UUID := (SELECT auth.uid());
BEGIN
  IF caller IS NULL OR NOT private.is_active() THEN
    RAISE EXCEPTION 'Your account is not active.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id INTO target FROM public.sections
   WHERE upper(join_code) = upper(btrim(code));

  IF target IS NULL THEN
    RAISE EXCEPTION 'That class code does not match any class.'
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.enrollments (student_id, section_id)
  VALUES (caller, target)
  ON CONFLICT DO NOTHING;

  RETURN target;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.open_exam_link(token TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  found  public.exams%ROWTYPE;
  caller UUID := (SELECT auth.uid());
BEGIN
  IF caller IS NULL OR NOT private.is_active() THEN
    RAISE EXCEPTION 'Your account is not active.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO found FROM public.exams WHERE share_token = btrim(token);

  IF found.id IS NULL THEN
    RAISE EXCEPTION 'That link does not match any exam.' USING ERRCODE = 'no_data_found';
  END IF;

  IF found.status <> 'PUBLISHED'::"ExamStatus" THEN
    RAISE EXCEPTION 'That exam is not open.' USING ERRCODE = 'no_data_found';
  END IF;

  IF (SELECT private.current_role_of()) = 'STUDENT'::"Role" THEN
    INSERT INTO public.exam_access (exam_id, student_id)
    VALUES (found.id, caller)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN found.id;
END;
$fn$;
