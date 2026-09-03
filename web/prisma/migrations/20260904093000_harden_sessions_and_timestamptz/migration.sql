-- RLS WITH CHECK constrains which ROWS a user may write, not which COLUMNS, so
-- exam_sessions_update_own let a student run
--   UPDATE exam_sessions SET score = 100, status = 'SUBMITTED'
-- and pass the check, because student_id still matched. Verified exploitable.
--
-- Students never legitimately UPDATE a session: they INSERT it to begin, and
-- submission/grading runs server-side with the service role (which bypasses RLS).
DROP POLICY IF EXISTS exam_sessions_update_own ON public.exam_sessions;

-- The INSERT path had the same shape of hole: a student could create a session
-- already marked SUBMITTED with a score, or backdate started_at to defeat the
-- timer. Force the opening state server-side rather than trusting the payload.
CREATE OR REPLACE FUNCTION private.force_new_session_state()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.started_at   := NOW();
  NEW.status       := 'IN_PROGRESS'::"SessionStatus";
  NEW.score        := NULL;
  NEW.submitted_at := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exam_sessions_force_new_state ON public.exam_sessions;
CREATE TRIGGER exam_sessions_force_new_state
  BEFORE INSERT ON public.exam_sessions
  FOR EACH ROW EXECUTE FUNCTION private.force_new_session_state();

-- Prisma maps DateTime to `timestamp(3)` (no time zone) by default. PostgREST then
-- serialises those without a Z suffix, and `new Date("2026-09-03T16:18:11.633")`
-- is parsed as LOCAL time by JS — so on a UTC+8 client every timestamp read 8 hours
-- early. The exam countdown would treat a fresh session as 8 hours old and
-- auto-submit instantly. Verified: 28803s of drift on a just-created session.
ALTER TABLE public.users            ALTER COLUMN created_at   TYPE timestamptz(3) USING created_at   AT TIME ZONE 'UTC';
ALTER TABLE public.sections         ALTER COLUMN created_at   TYPE timestamptz(3) USING created_at   AT TIME ZONE 'UTC';
ALTER TABLE public.exams            ALTER COLUMN created_at   TYPE timestamptz(3) USING created_at   AT TIME ZONE 'UTC';
ALTER TABLE public.exams            ALTER COLUMN updated_at   TYPE timestamptz(3) USING updated_at   AT TIME ZONE 'UTC';
ALTER TABLE public.questions        ALTER COLUMN created_at   TYPE timestamptz(3) USING created_at   AT TIME ZONE 'UTC';
ALTER TABLE public.question_answers ALTER COLUMN created_at   TYPE timestamptz(3) USING created_at   AT TIME ZONE 'UTC';
ALTER TABLE public.lesson_files     ALTER COLUMN created_at   TYPE timestamptz(3) USING created_at   AT TIME ZONE 'UTC';
ALTER TABLE public.exam_sessions    ALTER COLUMN started_at   TYPE timestamptz(3) USING started_at   AT TIME ZONE 'UTC';
ALTER TABLE public.exam_sessions    ALTER COLUMN submitted_at TYPE timestamptz(3) USING submitted_at AT TIME ZONE 'UTC';
ALTER TABLE public.exam_sessions    ALTER COLUMN created_at   TYPE timestamptz(3) USING created_at   AT TIME ZONE 'UTC';
ALTER TABLE public.answers          ALTER COLUMN answered_at  TYPE timestamptz(3) USING answered_at  AT TIME ZONE 'UTC';
ALTER TABLE public.flags            ALTER COLUMN occurred_at  TYPE timestamptz(3) USING occurred_at  AT TIME ZONE 'UTC';
ALTER TABLE public.audit_log        ALTER COLUMN created_at   TYPE timestamptz(3) USING created_at   AT TIME ZONE 'UTC';
ALTER TABLE public.backup_runs      ALTER COLUMN started_at   TYPE timestamptz(3) USING started_at   AT TIME ZONE 'UTC';
ALTER TABLE public.backup_runs      ALTER COLUMN finished_at  TYPE timestamptz(3) USING finished_at  AT TIME ZONE 'UTC';
ALTER TABLE public.ai_provider_keys ALTER COLUMN last_used_at TYPE timestamptz(3) USING last_used_at AT TIME ZONE 'UTC';
ALTER TABLE public.ai_provider_keys ALTER COLUMN created_at   TYPE timestamptz(3) USING created_at   AT TIME ZONE 'UTC';
