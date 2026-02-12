-- ============================================
-- Supabase leads 테이블 생성 스크립트
-- Supabase Dashboard → SQL Editor에서 실행
-- ============================================

-- leads 테이블
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT DEFAULT 'daangn'
);

-- created_at desc 정렬용 인덱스
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads (created_at DESC);

-- 이름/연락처 검색용 인덱스 (선택)
CREATE INDEX IF NOT EXISTS idx_leads_phone ON public.leads (phone);
