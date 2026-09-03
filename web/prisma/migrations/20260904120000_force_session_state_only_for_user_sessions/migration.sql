-- force_new_session_state exists to stop a STUDENT fabricating a session that is
-- already submitted, pre-scored, or back-dated. But it fired on every INSERT,
-- including PostgREST upserts (INSERT ... ON CONFLICT DO UPDATE), so restoring a
-- backup rewrote every completed session back to IN_PROGRESS and erased its score.
-- Verified: a restore reset a SUBMITTED/100% session to IN_PROGRESS/null.
--
-- Students are `authenticated` and always carry auth.uid(); the service role does
-- not. Gating on that keeps the protection exactly where it matters and lets
-- server-side restores write real historical state — the same split the audit
-- triggers use.
CREATE OR REPLACE FUNCTION private.force_new_session_state()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;  -- trusted server-side write (restore, seeding, grading)
  END IF;

  NEW.started_at   := NOW();
  NEW.status       := 'IN_PROGRESS'::"SessionStatus";
  NEW.score        := NULL;
  NEW.submitted_at := NULL;
  RETURN NEW;
END;
$$;
