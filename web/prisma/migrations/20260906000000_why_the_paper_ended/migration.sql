-- Why a paper ended.
--
-- A sitting knew it had been auto-submitted and nothing else, so the student was
-- shown "You have already submitted this exam. Score: 0%" and left to guess. The
-- three reasons a paper ends by itself are not remotely alike — time running
-- out, the exam closing underneath you, and being stopped for leaving the window
-- — and the last of those is an accusation. Someone accused is owed the reason.
--
-- The status column cannot carry it: AUTO_SUBMITTED already means all three.

DO $$ BEGIN
  CREATE TYPE "SubmitReason" AS ENUM
    ('MANUAL', 'TIME_UP', 'EXAM_CLOSED', 'STRIKES', 'INSTRUCTOR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.exam_sessions
  ADD COLUMN IF NOT EXISTS submitted_reason "SubmitReason";

-- Sittings that ended before this column existed. Nothing is invented: each
-- branch reads a record that was already being kept.
UPDATE public.exam_sessions s
SET submitted_reason = (
  CASE
    WHEN s.status = 'SUBMITTED'::"SessionStatus" THEN 'MANUAL'
    WHEN EXISTS (
      SELECT 1 FROM public.audit_log a
      WHERE a.action = 'force_submit_session' AND a.target_id = s.id
    ) THEN 'INSTRUCTOR'
    WHEN private.live_strikes(s.id)
         >= COALESCE((e.lockdown_config ->> 'maxStrikes')::int, 3) THEN 'STRIKES'
    ELSE 'TIME_UP'
  END
)::"SubmitReason"
FROM public.exams e
WHERE e.id = s.exam_id
  AND s.status <> 'IN_PROGRESS'::"SessionStatus"
  AND s.submitted_reason IS NULL;

/**
 * The warnings a student was stopped for, told to that student.
 *
 * They cannot read the flags table — a student auditing what the proctor saw is
 * a student learning what it misses — but being ended on three warnings and not
 * being allowed to know what they were is worse. This answers only about the
 * asker's own sitting, only for warnings that still stand, and one row per
 * strike rather than one per signal: three events from a single alt-tab are one
 * thing that happened, and reading them back as three would restate the very
 * bug this replaced.
 *
 * The type reported for a departure is the most telling of its signals, by the
 * same order of precedence the browser-side tracker uses.
 */
CREATE OR REPLACE FUNCTION public.my_strike_log(p_session_id uuid)
RETURNS TABLE (kind "FlagType", at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT DISTINCT ON (f.strike_number) f.type, f.occurred_at
  FROM public.flags f
  WHERE f.resolution IS NULL
    AND f.session_id = (
      SELECT s.id FROM public.exam_sessions s
      WHERE s.id = p_session_id AND s.student_id = (SELECT auth.uid())
    )
  ORDER BY f.strike_number,
    CASE f.type
      WHEN 'HONEYPOT'::"FlagType"        THEN 0
      WHEN 'TAB_SWITCH'::"FlagType"      THEN 1
      WHEN 'FULLSCREEN_EXIT'::"FlagType" THEN 2
      ELSE 3
    END,
    f.occurred_at;
$fn$;

REVOKE ALL ON FUNCTION public.my_strike_log(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_strike_log(uuid) TO authenticated;
