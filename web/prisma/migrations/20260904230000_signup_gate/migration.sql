-- Let students in with Google, without letting the whole internet in.
--
-- Signing up with a Google account requires Supabase's public signup endpoint
-- to be open, and that endpoint is not ours: it can be called directly, without
-- going near our signup form. So every rule the form used to imply has to hold
-- in the database instead.
--
-- Two rules. "Let students register themselves" was a setting nothing enforced
-- — it only ever hid a form. And a school knows what its email addresses look
-- like, so an optional domain list keeps strangers out even while registration
-- is open.
--
-- Neither refuses the account outright: GoTrue treats an exception here as a
-- failed login and the person sees a blank error. They get an account that
-- exists but is DISABLED, which requireRole() already turns away with a message
-- that says what happened, and an admin can enable if it was a mistake.

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS allowed_email_domains TEXT NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  allow_self  BOOLEAN;
  domain_list TEXT;
  domains     TEXT[];
  their_domain TEXT;
  ok          BOOLEAN;
BEGIN
  SELECT allow_student_signup, allowed_email_domains
    INTO allow_self, domain_list
    FROM public.system_settings WHERE id;

  allow_self  := COALESCE(allow_self, TRUE);
  domain_list := COALESCE(domain_list, '');

  ok := allow_self;

  IF ok AND btrim(domain_list) <> '' THEN
    SELECT array_agg(lower(btrim(d))) INTO domains
      FROM unnest(string_to_array(domain_list, ',')) AS d
     WHERE btrim(d) <> '';
    their_domain := lower(split_part(NEW.email, '@', 2));
    ok := their_domain = ANY(domains);
  END IF;

  -- The role is never taken from the request: a browser controls its own signup
  -- metadata, and a probe once used that to make itself an ADMIN. Anyone who
  -- arrives here is a student; an admin grants anything higher afterwards, from
  -- trusted server code. An admin-provisioned account is set ACTIVE by that same
  -- code, so the gate above only ever applies to people who let themselves in.
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
