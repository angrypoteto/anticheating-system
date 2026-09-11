-- Functions a signed-out visitor could call, and should not be able to.
--
-- Supabase's security advisor listed five SECURITY DEFINER functions the `anon`
-- role could execute through /rest/v1/rpc: close_exam, open_exam,
-- open_exam_link, join_class and my_exams. None of them was exploitable — each
-- checks the caller inside (an ownership test, or auth.uid() being set), and a
-- signed-out call simply fails. But every one of them runs with the owner's
-- rights, and "the check inside will catch it" is one careless edit away from
-- not being true. Nothing in the app calls them signed out: the share link
-- sends visitors to sign in first, and the rest run on signed-in pages.
--
-- Postgres grants EXECUTE on a new function to PUBLIC, which anon inherits, so
-- revoking from anon alone would change nothing. Both go, and the roles that
-- do call these are granted explicitly.

REVOKE EXECUTE ON FUNCTION public.close_exam(uuid)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.open_exam(uuid)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.open_exam_link(text)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_class(text)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_exams()            FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.close_exam(uuid)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.open_exam(uuid)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.open_exam_link(text)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.join_class(text)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_exams()             TO authenticated, service_role;

-- And the next function written here does not start out callable signed out.
-- A function that should be public now has to say so with its own GRANT.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

-- The one function without a pinned search_path. It only returns a constant,
-- but a mutable search_path is how a function gets pointed at the wrong
-- objects, and the advisor is right to want none of them.
ALTER FUNCTION private.flag_settle_window() SET search_path = '';
