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
  utm_term TEXT,
  marketing_consent SMALLINT,
  entry_page TEXT
);

-- created_at desc 정렬용 인덱스
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads (created_at DESC);

-- 이름/연락처 검색용 인덱스 (선택)
CREATE INDEX IF NOT EXISTS idx_leads_phone ON public.leads (phone);
CREATE INDEX IF NOT EXISTS idx_leads_utm_source ON public.leads (utm_source);
CREATE INDEX IF NOT EXISTS idx_leads_marketing_consent ON public.leads (marketing_consent);

-- tylife_b2b 테이블 (B2B 파트너 신청 - /business 페이지용)
CREATE TABLE IF NOT EXISTS public.tylife_b2b (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT DEFAULT 'business',
  entry_page TEXT,
  status TEXT NOT NULL DEFAULT '대기',
  memo TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  marketing_consent SMALLINT,
  region TEXT,
  available_time TEXT,
  age_group TEXT,
  job TEXT,
  job_rank TEXT
);
CREATE INDEX IF NOT EXISTS idx_tylife_b2b_created_at ON public.tylife_b2b (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tylife_b2b_phone ON public.tylife_b2b (phone);
CREATE INDEX IF NOT EXISTS idx_tylife_b2b_utm_source ON public.tylife_b2b (utm_source);
CREATE INDEX IF NOT EXISTS idx_tylife_b2b_marketing_consent ON public.tylife_b2b (marketing_consent);

-- lead_consents (개인정보/마케팅 동의 이력) — 상세는 migrations/058_lead_consents.sql
CREATE TABLE IF NOT EXISTS public.lead_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL,
  lead_type TEXT NOT NULL CHECK (lead_type IN ('feedlife', 'tylife_b2b')),
  privacy_required BOOLEAN NOT NULL DEFAULT true,
  custom_info_consent BOOLEAN NOT NULL DEFAULT false,
  marketing_consent BOOLEAN NOT NULL DEFAULT false,
  ad_phone_consent BOOLEAN NOT NULL DEFAULT false,
  ad_sms_consent BOOLEAN NOT NULL DEFAULT false,
  ad_kakao_consent BOOLEAN NOT NULL DEFAULT false,
  ad_email_consent BOOLEAN NOT NULL DEFAULT false,
  consent_version TEXT NOT NULL DEFAULT '2026-09-v1',
  consent_source TEXT,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
