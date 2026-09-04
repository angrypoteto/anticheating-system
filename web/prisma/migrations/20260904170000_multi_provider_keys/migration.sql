-- Letting an admin type any provider name is only honest if generation can then
-- actually call it. Most providers (Groq, OpenAI, OpenRouter, DeepSeek, Together)
-- speak the OpenAI chat-completions shape, so a key records which style it uses,
-- where to reach it, and which model to ask for.
ALTER TABLE public.ai_provider_keys
  ADD COLUMN IF NOT EXISTS api_style TEXT NOT NULL DEFAULT 'gemini',
  ADD COLUMN IF NOT EXISTS base_url  TEXT,
  ADD COLUMN IF NOT EXISTS model     TEXT;

ALTER TABLE public.ai_provider_keys DROP CONSTRAINT IF EXISTS ai_provider_keys_api_style_check;
ALTER TABLE public.ai_provider_keys
  ADD CONSTRAINT ai_provider_keys_api_style_check CHECK (api_style IN ('gemini', 'openai'));

-- The 4-argument version is dropped so a caller can never quietly land on it and
-- silently lose the endpoint and model.
DROP FUNCTION IF EXISTS public.ai_key_store(TEXT, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.ai_key_store(
  p_provider TEXT, p_label TEXT, p_secret TEXT, p_added_by UUID,
  p_api_style TEXT DEFAULT 'gemini', p_base_url TEXT DEFAULT NULL, p_model TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_secret_id UUID; v_key_id UUID;
BEGIN
  IF length(trim(p_secret)) < 8 THEN RAISE EXCEPTION 'key looks too short to be valid'; END IF;
  IF p_api_style NOT IN ('gemini', 'openai') THEN RAISE EXCEPTION 'unknown api style %', p_api_style; END IF;
  IF p_api_style = 'openai' AND coalesce(trim(p_base_url), '') = '' THEN
    RAISE EXCEPTION 'an OpenAI-compatible provider needs a base URL';
  END IF;

  v_secret_id := vault.create_secret(
    p_secret, 'ai_key_' || p_provider || '_' || gen_random_uuid()::text,
    'AI provider key: ' || p_label);

  INSERT INTO public.ai_provider_keys
    (provider, label, vault_secret_id, key_hint, status, added_by_id, api_style, base_url, model)
  VALUES
    (p_provider, p_label, v_secret_id, right(trim(p_secret), 4), 'ACTIVE'::"KeyStatus", p_added_by,
     p_api_style, nullif(trim(p_base_url), ''), nullif(trim(p_model), ''))
  RETURNING id INTO v_key_id;

  RETURN v_key_id;
END; $fn$;

REVOKE ALL ON FUNCTION public.ai_key_store(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_key_store(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT) TO service_role;
