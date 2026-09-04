-- CRITICAL: privilege escalation, verified exploitable against production.
--
-- handle_new_user derived the role from NEW.raw_user_meta_data, which is exactly
-- the object a browser passes to supabase.auth.signUp({ options: { data } }).
-- Public signup is enabled on this project and the publishable key ships in the
-- client bundle, so any stranger could register themselves as ADMIN:
--
--   signUp({ email, password, options: { data: { role: 'ADMIN' } } })
--   -> public.users row with role = ADMIN
--
-- Reading raw_app_meta_data instead (service-role-only) does NOT work either:
-- GoTrue inserts the auth.users row first and applies app_metadata in a later
-- update, so the trigger sees no role and everyone becomes STUDENT.
--
-- So the trigger no longer looks at metadata at all. Every new account starts as
-- STUDENT, and any higher role is granted afterwards by the admin server action
-- using the service role — the only path that was ever trustworthy.
CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO public.users (id, email, role, status, created_at)
  VALUES (NEW.id, NEW.email, 'STUDENT'::"Role", 'ACTIVE'::"UserStatus", NOW())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$fn$;
