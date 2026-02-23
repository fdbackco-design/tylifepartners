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
  source TEXT DEFAULT 'daangn',
  status TEXT NOT NULL DEFAULT '대기',
  memo TEXT,
  desired_date TEXT,
  desired_time TEXT,
  location TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT
);

-- created_at desc 정렬용 인덱스
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads (created_at DESC);

-- 이름/연락처 검색용 인덱스 (선택)
CREATE INDEX IF NOT EXISTS idx_leads_phone ON public.leads (phone);
CREATE INDEX IF NOT EXISTS idx_leads_utm_source ON public.leads (utm_source);

-- tylife_b2b 테이블 (B2B 파트너 신청 - /business 페이지용)
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
