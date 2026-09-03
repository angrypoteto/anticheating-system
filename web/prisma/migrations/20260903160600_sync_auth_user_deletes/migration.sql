-- Deleting from auth.users left the mirrored public.users row behind, since the two
-- are linked by convention rather than a cross-schema FK. A trigger (rather than a real
-- FK) keeps this out of Prisma's diffing, which manages foreign keys but not triggers.
--
-- Users with dependent rows (exams, sections) hit ON DELETE RESTRICT and the delete
-- fails — intentional, since the console disables accounts rather than deleting them.
CREATE OR REPLACE FUNCTION private.handle_user_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.users WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.handle_user_delete();
