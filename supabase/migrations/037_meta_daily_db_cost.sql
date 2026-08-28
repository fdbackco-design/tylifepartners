-- 어제 광고비 ÷ 어제 DB유입 → 오늘의 DB 비용 스냅샷
-- 적용: Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS public.meta_daily_db_cost (
  metrics_date DATE PRIMARY KEY,
  spend NUMERIC(14, 4) NOT NULL DEFAULT 0,
  db_inflow_count INTEGER NOT NULL DEFAULT 0,
  cost_per_db NUMERIC(14, 4),
  currency TEXT,
  sync_status TEXT NOT NULL DEFAULT 'ok'
    CHECK (sync_status IN ('ok', 'error', 'missing', 'pending')),
  sync_error TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.meta_daily_db_cost IS
  'metrics_date(어제) 광고비·DB유입으로 산출. 화면의 「오늘의 DB 비용」에 사용. daangn 유입 제외';
COMMENT ON COLUMN public.meta_daily_db_cost.db_inflow_count IS
  '소비자+후보자 DB 신규 건수 (utm_source=daangn 제외, merge active)';
COMMENT ON COLUMN public.meta_daily_db_cost.cost_per_db IS
  'spend ÷ db_inflow_count (유입 0이면 NULL)';
