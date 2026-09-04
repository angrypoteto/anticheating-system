-- The setting is about class codes, not about registration.
--
-- It was read as "may students create accounts at all", and an account made
-- while it was off was disabled. That is not what it is for. Students register
-- either way; the switch decides whether they may put *themselves* into a class
-- with a code. Off, they arrive with no class and an admin enrols them.
--
-- The name is fixed too, because the old one is what caused the misreading.

ALTER TABLE public.system_settings
  RENAME COLUMN allow_student_signup TO allow_class_self_join;

-- Registration is no longer gated by that switch. What is left is the domain
-- list: the one rule that says who belongs to this school. Blank accepts any
-- address, which is fine on a laptop and is not fine on a public site.
CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  domain_list  TEXT;
  domains      TEXT[];
  their_domain TEXT;
  ok           BOOLEAN := TRUE;
BEGIN
  SELECT COALESCE(allowed_email_domains, '') INTO domain_list
    FROM public.system_settings WHERE id;

  IF btrim(COALESCE(domain_list, '')) <> '' THEN
    SELECT array_agg(lower(btrim(d))) INTO domains
      FROM unnest(string_to_array(domain_list, ',')) AS d
     WHERE btrim(d) <> '';
    their_domain := lower(split_part(NEW.email, '@', 2));
    ok := their_domain = ANY(domains);
  END IF;

  -- The role is never taken from the request: a browser controls its own signup
  -- metadata, and a probe once used that to make itself an ADMIN. Everyone who
  -- arrives here is a student; anything higher is granted afterwards by trusted
  -- server code, which also sets ACTIVE explicitly.
  INSERT INTO public.users (id, email, role, status, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    'STUDENT'::"Role",
    CASE WHEN ok THEN 'ACTIVE' ELSE 'DISABLED' END::"UserStatus",
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$fn$;

-- Joining by code is the thing the switch actually controls, so it is enforced
-- where joining happens rather than by hiding a form. Enrolling a student stays
-- open to admins and to the teacher of the class, whose policies are unchanged.
CREATE OR REPLACE FUNCTION public.join_class(code TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  target UUID;
  caller UUID := (SELECT auth.uid());
  allowed BOOLEAN;
BEGIN
  IF caller IS NULL OR NOT private.is_active() THEN
    RAISE EXCEPTION 'Your account is not active.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(allow_class_self_join, TRUE) INTO allowed
    FROM public.system_settings WHERE id;

  IF NOT COALESCE(allowed, TRUE) THEN
    RAISE EXCEPTION 'Your school assigns classes. Ask your teacher to add you.'
      USING ERRCODE = 'insufficient_privilege';
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

-- No backfill: nobody is disabled right now, and "disabled by the old
-- registration switch" is indistinguishable from "disabled by an admin on
-- purpose". Re-activating on a guess would undo a deliberate decision.
