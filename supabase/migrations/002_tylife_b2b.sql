-- ============================================
-- tylife_b2b 테이블 생성 (B2B 파트너 신청 - leads와 동일 구조)
-- Supabase Dashboard → SQL Editor에서 실행
-- ============================================

CREATE TABLE IF NOT EXISTS public.tylife_b2b (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT DEFAULT 'business',
  status TEXT NOT NULL DEFAULT '대기',
  memo TEXT
);

CREATE INDEX IF NOT EXISTS idx_tylife_b2b_created_at ON public.tylife_b2b (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tylife_b2b_phone ON public.tylife_b2b (phone);
