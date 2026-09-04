-- A class can exist before anyone teaches it.
-- Requiring an instructor at creation forced a backwards workflow: you could
-- not lay out the sections first and staff them after. An unassigned class is
-- safe by construction — instructs_section() and owns_exam() both join on
-- instructor_id, so NULL matches nobody and the class simply has no teacher
-- until one is set.
ALTER TABLE public.sections ALTER COLUMN instructor_id DROP NOT NULL;

-- A person is more than an email address.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS username  TEXT;

-- Usernames are compared case-insensitively, so reserve them that way.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key
  ON public.users (lower(username)) WHERE username IS NOT NULL;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_username_format;
ALTER TABLE public.users ADD CONSTRAINT users_username_format
  CHECK (username IS NULL OR username ~ '^[A-Za-z0-9._-]{3,30}$');

-- Let a signed-in user maintain their own name and username. Role, status and
-- section stay out of reach: this policy is UPDATE-only and RLS restricts rows,
-- not columns, so a policy alone would let someone set their own role. The app
-- writes only these two fields and the trigger below refuses any attempt to
-- change the rest — the check that actually holds.
CREATE OR REPLACE FUNCTION private.protect_user_identity()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  -- Service-role writes (admin console) are trusted and pass through.
  IF (SELECT auth.uid()) IS NULL THEN RETURN NEW; END IF;

  IF NEW.id <> OLD.id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.section_id IS DISTINCT FROM OLD.section_id
     OR NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Only your name and username can be changed here.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS users_protect_identity ON public.users;
CREATE TRIGGER users_protect_identity
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION private.protect_user_identity();

DROP POLICY IF EXISTS users_update_own_profile ON public.users;
CREATE POLICY users_update_own_profile ON public.users
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));
