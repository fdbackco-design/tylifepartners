-- Meta 광고별 일간 Insights(지출·리드) 캐시 → 개별 DB 추정 비용(CPL)
-- 적용: Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS public.meta_ad_daily_insights (
  insight_date DATE NOT NULL,
  ad_id TEXT NOT NULL,
  spend NUMERIC(14, 4) NOT NULL DEFAULT 0,
  lead_count INTEGER NOT NULL DEFAULT 0,
  -- spend / lead_count (lead_count = 0이면 NULL)
  cost_per_lead NUMERIC(14, 4),
  currency TEXT,
  sync_status TEXT NOT NULL DEFAULT 'ok'
    CHECK (sync_status IN ('ok', 'error', 'missing', 'pending')),
  sync_error TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (insight_date, ad_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_ad_daily_insights_ad_date
  ON public.meta_ad_daily_insights (ad_id, insight_date DESC);

CREATE INDEX IF NOT EXISTS idx_meta_ad_daily_insights_synced
  ON public.meta_ad_daily_insights (synced_at DESC);

COMMENT ON TABLE public.meta_ad_daily_insights IS
  'Meta Insights API 광고별 일간 spend/lead 캐시. CPL = spend ÷ lead_count';
COMMENT ON COLUMN public.meta_ad_daily_insights.insight_date IS
  '광고계정 시간대 기준 날짜';
COMMENT ON COLUMN public.meta_ad_daily_insights.cost_per_lead IS
  '개별 DB 추정 비용(CPL). lead_count=0이면 NULL';

-- 광고계정 메타(시간대) 캐시
CREATE TABLE IF NOT EXISTS public.meta_ad_account_meta (
  ad_account_id TEXT PRIMARY KEY,
  timezone_name TEXT NOT NULL DEFAULT 'Asia/Seoul',
  currency TEXT,
  raw JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.meta_ad_account_meta IS 'Meta 광고계정 timezone/currency 캐시';
