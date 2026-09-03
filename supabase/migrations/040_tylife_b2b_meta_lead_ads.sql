-- Meta Lead Ads CSV/웹훅용 후보자(tylife_b2b) 추적 컬럼
-- 적용: Supabase Dashboard → SQL Editor

ALTER TABLE public.tylife_b2b
  ADD COLUMN IF NOT EXISTS meta_lead_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_form_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_created_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN public.tylife_b2b.meta_lead_id IS 'Meta Instant Form lead id (CSV id / leadgen_id)';
COMMENT ON COLUMN public.tylife_b2b.meta_form_id IS 'Meta Lead Form ID';
COMMENT ON COLUMN public.tylife_b2b.meta_created_time IS 'Meta lead created_time';
COMMENT ON COLUMN public.tylife_b2b.email IS '이메일 (Lead Ads 등)';

CREATE UNIQUE INDEX IF NOT EXISTS idx_tylife_b2b_meta_lead_id_unique
  ON public.tylife_b2b (meta_lead_id)
  WHERE meta_lead_id IS NOT NULL AND meta_lead_id <> '';

CREATE INDEX IF NOT EXISTS idx_tylife_b2b_meta_form_id
  ON public.tylife_b2b (meta_form_id)
  WHERE meta_form_id IS NOT NULL;
