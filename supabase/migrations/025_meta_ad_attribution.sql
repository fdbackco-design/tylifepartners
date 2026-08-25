-- Meta 광고 유입 소재 추적
-- 적용: Supabase Dashboard → SQL Editor

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS meta_ad_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_adset_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_campaign_id TEXT;

ALTER TABLE public.tylife_b2b
  ADD COLUMN IF NOT EXISTS meta_ad_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_adset_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_campaign_id TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_meta_ad_id ON public.leads (meta_ad_id) WHERE meta_ad_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tylife_b2b_meta_ad_id ON public.tylife_b2b (meta_ad_id) WHERE meta_ad_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.meta_ad_creatives (
  ad_id TEXT PRIMARY KEY,
  ad_name TEXT,
  creative_id TEXT,
  creative_type TEXT,
  thumbnail_url TEXT,
  image_url TEXT,
  video_id TEXT,
  permalink_url TEXT,
  raw JSONB,
  fetch_status TEXT NOT NULL DEFAULT 'ok'
    CHECK (fetch_status IN ('ok', 'error', 'missing_token', 'not_found')),
  fetch_error TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.meta_ad_creatives IS 'Meta Marketing API 광고 소재 캐시 (ad_id 기준)';
COMMENT ON COLUMN public.leads.meta_ad_id IS 'Meta 광고 ID (URL ad_id 또는 utm_content={{ad.id}})';
