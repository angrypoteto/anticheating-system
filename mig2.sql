-- ============ #7 audit what students and teachers do, with retention ============
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS audit_retention_days INT NOT NULL DEFAULT 30;

-- Student-side events were invisible: the log only held instructor and admin
-- writes. Sitting, submitting and being flagged are exactly the events an
-- investigation needs.
--
-- answers are deliberately NOT audited: autosave fires on every keystroke pause
-- and would bury everything else.
CREATE OR REPLACE FUNCTION private.audit_session_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor UUID := COALESCE((SELECT auth.uid()), NEW.student_id);
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (actor_id, action, target_type, target_id, metadata)
    VALUES (v_actor, 'exam_started', 'exam_sessions', NEW.id,
            jsonb_build_object('exam_id', NEW.exam_id));
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'IN_PROGRESS'::"SessionStatus"
        AND NEW.status <> 'IN_PROGRESS'::"SessionStatus" THEN
    INSERT INTO public.audit_log (actor_id, action, target_type, target_id, metadata)
    VALUES (v_actor, 'exam_submitted', 'exam_sessions', NEW.id,
            jsonb_build_object('exam_id', NEW.exam_id, 'status', NEW.status, 'score', NEW.score));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_exam_sessions ON public.exam_sessions;
CREATE TRIGGER audit_exam_sessions
  AFTER INSERT OR UPDATE ON public.exam_sessions
  FOR EACH ROW EXECUTE FUNCTION private.audit_session_event();

CREATE OR REPLACE FUNCTION private.audit_flag_raised()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student UUID;
BEGIN
  SELECT student_id INTO v_student FROM public.exam_sessions WHERE id = NEW.session_id;
  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, metadata)
  VALUES (COALESCE((SELECT auth.uid()), v_student), 'flag_raised', 'flags', NEW.id,
          jsonb_build_object('type', NEW.type, 'strike', NEW.strike_number,
                             'session_id', NEW.session_id));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_flags ON public.flags;
CREATE TRIGGER audit_flags
  AFTER INSERT ON public.flags
  FOR EACH ROW EXECUTE FUNCTION private.audit_flag_raised();

-- Retention. The log is append-only for everybody, so expiry runs as a
-- SECURITY DEFINER routine rather than by handing anyone DELETE rights.
CREATE OR REPLACE FUNCTION public.purge_expired_audit_log()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_days INT;
  v_removed INT;
BEGIN
  SELECT audit_retention_days INTO v_days FROM public.system_settings WHERE id = TRUE;
  IF v_days IS NULL OR v_days <= 0 THEN
    RETURN 0;  -- 0 or unset means keep everything
  END IF;

  DELETE FROM public.audit_log
  WHERE created_at < NOW() - (v_days || ' days')::interval;

  GET DIAGNOSTICS v_removed = ROW_COUNT;
  RETURN v_removed;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_audit_log() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_audit_log() TO service_role;
