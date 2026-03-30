-- ============================================
-- tylife_b2b 테이블에 UTM 컬럼 추가
-- Supabase Dashboard → SQL Editor에서 실행
-- ============================================

ALTER TABLE public.tylife_b2b ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE public.tylife_b2b ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE public.tylife_b2b ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

CREATE INDEX IF NOT EXISTS idx_tylife_b2b_utm_source ON public.tylife_b2b (utm_source);

