-- Keys live in Supabase Vault (encrypted at rest, decryptable only via the vault
-- schema, which PostgREST does not expose). ai_provider_keys keeps only metadata
-- plus a pointer to the secret and a 4-character hint for the UI.
ALTER TABLE public.ai_provider_keys
  DROP COLUMN IF EXISTS encrypted_key,
  ADD COLUMN IF NOT EXISTS vault_secret_id UUID,
  ADD COLUMN IF NOT EXISTS key_hint TEXT NOT NULL DEFAULT '';

-- Wrappers must sit in `public` for PostgREST to reach them, but EXECUTE is granted
-- to service_role alone — anon and authenticated cannot call them at all, so no
-- SECURITY DEFINER surface is exposed to signed-in users (verified: even an admin
-- session is denied).
CREATE OR REPLACE FUNCTION public.ai_key_store(
  p_provider TEXT, p_label TEXT, p_secret TEXT, p_added_by UUID
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_secret_id UUID;
  v_key_id    UUID;
BEGIN
  IF length(trim(p_secret)) < 8 THEN
    RAISE EXCEPTION 'key looks too short to be valid';
  END IF;

  v_secret_id := vault.create_secret(
    p_secret,
    'ai_key_' || p_provider || '_' || gen_random_uuid()::text,
    'AI provider key: ' || p_label
  );

  INSERT INTO public.ai_provider_keys
    (provider, label, vault_secret_id, key_hint, status, added_by_id)
  VALUES
    (p_provider, p_label, v_secret_id, right(trim(p_secret), 4), 'ACTIVE'::"KeyStatus", p_added_by)
  RETURNING id INTO v_key_id;

  RETURN v_key_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_key_reveal(p_key_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_secret TEXT;
BEGIN
  SELECT ds.decrypted_secret INTO v_secret
  FROM public.ai_provider_keys k
  JOIN vault.decrypted_secrets ds ON ds.id = k.vault_secret_id
  WHERE k.id = p_key_id;
  RETURN v_secret;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_key_delete(p_key_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_secret_id UUID;
BEGIN
  SELECT vault_secret_id INTO v_secret_id
  FROM public.ai_provider_keys WHERE id = p_key_id;

  DELETE FROM public.ai_provider_keys WHERE id = p_key_id;
  IF v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_key_store(TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_key_reveal(UUID)                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_key_delete(UUID)                  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_key_store(TEXT, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_key_reveal(UUID)                  TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_key_delete(UUID)                  TO service_role;
