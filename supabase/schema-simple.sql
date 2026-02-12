-- ============================================
-- Supabase leads 테이블 - 간단 버전 (pg_trgm 없이)
-- Supabase Dashboard → SQL Editor에서 실행
-- ============================================

CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT DEFAULT 'daangn'
);

-- created_at desc 정렬용
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads (created_at DESC);

-- phone 검색용 (숫자 검색)
CREATE INDEX IF NOT EXISTS idx_leads_phone ON public.leads (phone);
