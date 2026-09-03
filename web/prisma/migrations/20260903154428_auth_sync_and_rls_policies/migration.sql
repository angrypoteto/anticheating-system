-- Auth sync triggers, role helpers, and per-role RLS policies.
--
-- Helpers live in `private` rather than `public` because PostgREST exposes every
-- public function as an RPC endpoint; SECURITY DEFINER helpers must not be callable
-- over the API. Policies and triggers can still reach them from any schema.

CREATE SCHEMA IF NOT EXISTS private;

-- Mirror auth.users into public.users. Role comes from the metadata the admin sets
-- when creating the account; defaults to STUDENT if absent.
CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (id, email, role, status, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE((NEW.raw_user_meta_data ->> 'role')::"Role", 'STUDENT'::"Role"),
    'ACTIVE'::"UserStatus",
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.handle_user_email_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.users SET email = NEW.email WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.handle_user_email_update();

-- SECURITY DEFINER so policies on public.users don't recurse when checking the caller's role.
CREATE OR REPLACE FUNCTION private.current_role_of()
RETURNS "Role" LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.users WHERE id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(private.current_role_of() = 'ADMIN'::"Role", FALSE);
$$;

CREATE OR REPLACE FUNCTION private.is_instructor()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(private.current_role_of() = 'INSTRUCTOR'::"Role", FALSE);
$$;

CREATE OR REPLACE FUNCTION private.owns_exam(exam_uuid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exams e
    JOIN public.sections s ON s.id = e.section_id
    WHERE e.id = exam_uuid AND s.instructor_id = (SELECT auth.uid())
  );
$$;

-- Policies evaluate as the querying role, so `authenticated` needs to reach these.
-- `anon` deliberately gets nothing.
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.current_role_of() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_instructor() TO authenticated;
GRANT EXECUTE ON FUNCTION private.owns_exam(UUID) TO authenticated;

-- users: read yourself; instructors read their section's students; admins do anything.
CREATE POLICY users_select_self ON public.users
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

CREATE POLICY users_select_instructor ON public.users
  FOR SELECT TO authenticated
  USING (
    private.is_instructor()
    AND section_id IN (SELECT id FROM public.sections WHERE instructor_id = (SELECT auth.uid()))
  );

CREATE POLICY users_admin_all ON public.users
  FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

-- sections: your own section (student), sections you teach (instructor), all (admin).
CREATE POLICY sections_select_member ON public.sections
  FOR SELECT TO authenticated
  USING (
    instructor_id = (SELECT auth.uid())
    OR id IN (SELECT section_id FROM public.users WHERE id = (SELECT auth.uid()))
  );

CREATE POLICY sections_admin_all ON public.sections
  FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

-- exams: students see only PUBLISHED exams for their section; instructors manage their own.
CREATE POLICY exams_select_student ON public.exams
  FOR SELECT TO authenticated
  USING (
    status = 'PUBLISHED'::"ExamStatus"
    AND section_id IN (SELECT section_id FROM public.users WHERE id = (SELECT auth.uid()))
  );

CREATE POLICY exams_instructor_all ON public.exams
  FOR ALL TO authenticated
  USING (section_id IN (SELECT id FROM public.sections WHERE instructor_id = (SELECT auth.uid())))
  WITH CHECK (section_id IN (SELECT id FROM public.sections WHERE instructor_id = (SELECT auth.uid())));

CREATE POLICY exams_admin_all ON public.exams
  FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

-- questions: reachable only through an exam the student may see. correct_answer is not
-- column-protected here, so the app must select explicit columns for student-facing reads.
CREATE POLICY questions_select_student ON public.questions
  FOR SELECT TO authenticated
  USING (
    exam_id IN (
      SELECT id FROM public.exams
      WHERE status = 'PUBLISHED'::"ExamStatus"
        AND section_id IN (SELECT section_id FROM public.users WHERE id = (SELECT auth.uid()))
    )
  );

CREATE POLICY questions_instructor_all ON public.questions
  FOR ALL TO authenticated
  USING (private.owns_exam(exam_id)) WITH CHECK (private.owns_exam(exam_id));

CREATE POLICY questions_admin_all ON public.questions
  FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

-- lesson_files: instructor-only material.
CREATE POLICY lesson_files_instructor_all ON public.lesson_files
  FOR ALL TO authenticated
  USING (private.owns_exam(exam_id)) WITH CHECK (private.owns_exam(exam_id));

CREATE POLICY lesson_files_admin_all ON public.lesson_files
  FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

-- exam_sessions: a student reads/creates only their own; instructors watch their exams.
CREATE POLICY exam_sessions_select_own ON public.exam_sessions
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()));

CREATE POLICY exam_sessions_insert_own ON public.exam_sessions
  FOR INSERT TO authenticated
  WITH CHECK (student_id = (SELECT auth.uid()));

CREATE POLICY exam_sessions_update_own ON public.exam_sessions
  FOR UPDATE TO authenticated
  USING (student_id = (SELECT auth.uid()) AND status = 'IN_PROGRESS'::"SessionStatus")
  WITH CHECK (student_id = (SELECT auth.uid()));

CREATE POLICY exam_sessions_instructor ON public.exam_sessions
  FOR ALL TO authenticated
  USING (private.owns_exam(exam_id)) WITH CHECK (private.owns_exam(exam_id));

CREATE POLICY exam_sessions_admin_all ON public.exam_sessions
  FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

-- answers: writable only while the owning session is still in progress.
CREATE POLICY answers_select_own ON public.answers
  FOR SELECT TO authenticated
  USING (session_id IN (SELECT id FROM public.exam_sessions WHERE student_id = (SELECT auth.uid())));

CREATE POLICY answers_insert_own ON public.answers
  FOR INSERT TO authenticated
  WITH CHECK (
    session_id IN (
      SELECT id FROM public.exam_sessions
      WHERE student_id = (SELECT auth.uid()) AND status = 'IN_PROGRESS'::"SessionStatus"
    )
  );

CREATE POLICY answers_update_own ON public.answers
  FOR UPDATE TO authenticated
  USING (
    session_id IN (
      SELECT id FROM public.exam_sessions
      WHERE student_id = (SELECT auth.uid()) AND status = 'IN_PROGRESS'::"SessionStatus"
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM public.exam_sessions
      WHERE student_id = (SELECT auth.uid()) AND status = 'IN_PROGRESS'::"SessionStatus"
    )
  );

CREATE POLICY answers_instructor_select ON public.answers
  FOR SELECT TO authenticated
  USING (
    session_id IN (SELECT es.id FROM public.exam_sessions es WHERE private.owns_exam(es.exam_id))
  );

CREATE POLICY answers_admin_all ON public.answers
  FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

-- flags: a student may only write flags against their own live session, never read them back.
CREATE POLICY flags_insert_own ON public.flags
  FOR INSERT TO authenticated
  WITH CHECK (
    session_id IN (
      SELECT id FROM public.exam_sessions
      WHERE student_id = (SELECT auth.uid()) AND status = 'IN_PROGRESS'::"SessionStatus"
    )
  );

CREATE POLICY flags_instructor_all ON public.flags
  FOR ALL TO authenticated
  USING (
    session_id IN (SELECT es.id FROM public.exam_sessions es WHERE private.owns_exam(es.exam_id))
  )
  WITH CHECK (
    session_id IN (SELECT es.id FROM public.exam_sessions es WHERE private.owns_exam(es.exam_id))
  );

CREATE POLICY flags_admin_all ON public.flags
  FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

-- audit_log / backup_runs / ai_provider_keys: admin-readable only.
-- Writes come from the server (service_role), which bypasses RLS entirely.
CREATE POLICY audit_log_admin_select ON public.audit_log
  FOR SELECT TO authenticated
  USING (private.is_admin());

CREATE POLICY backup_runs_admin_select ON public.backup_runs
  FOR SELECT TO authenticated
  USING (private.is_admin());

CREATE POLICY ai_provider_keys_admin_select ON public.ai_provider_keys
  FOR SELECT TO authenticated
  USING (private.is_admin());
