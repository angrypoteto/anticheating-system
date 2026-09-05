-- The identity guard was refusing administrators.
--
-- protect_user_identity() stops a signed-in session changing anybody's id,
-- role, status or email — that is what makes the "edit your own profile" policy
-- safe, since row-level security restricts rows and not columns.
--
-- But it applied to every session, including an administrator's. Disabling an
-- account or granting a role through an admin's own session was refused with
-- "Only your name and username can be changed here.", which is both wrong and
-- confusing when said to an administrator. The console works today only because
-- those actions go through the service role, where auth.uid() is null and the
-- guard passes through — so the next admin feature written the ordinary way
-- would have hit this and looked like a permissions bug.
--
-- Administrators are already gated by the users_admin_all policy. The guard is
-- there to stop everyone else, so it now says so.
CREATE OR REPLACE FUNCTION private.protect_user_identity()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  -- Service-role writes (the admin console) carry no session and are trusted.
  IF (SELECT auth.uid()) IS NULL THEN RETURN NEW; END IF;

  -- An administrator may change roles and statuses; that is the job.
  IF private.is_admin() THEN RETURN NEW; END IF;

  IF NEW.id <> OLD.id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Only your name and username can be changed here.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$fn$;
