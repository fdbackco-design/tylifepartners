-- Meta Lead Ads (Instant Form) 웹훅 연동
-- 적용: Supabase Dashboard → SQL Editor

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS meta_lead_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_form_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_created_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN public.leads.meta_lead_id IS 'Meta Instant Form leadgen_id (웹훅 중복 방지용)';
COMMENT ON COLUMN public.leads.meta_form_id IS 'Meta Lead Form ID';
COMMENT ON COLUMN public.leads.meta_created_time IS 'Meta lead created_time';
COMMENT ON COLUMN public.leads.email IS '이메일 (Lead Ads 등)';

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_meta_lead_id_unique
  ON public.leads (meta_lead_id)
  WHERE meta_lead_id IS NOT NULL AND meta_lead_id <> '';

CREATE INDEX IF NOT EXISTS idx_leads_meta_form_id
  ON public.leads (meta_form_id)
  WHERE meta_form_id IS NOT NULL;
