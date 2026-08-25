-- 상담 신청 블랙리스트 (전화번호 기준 조용히 차단)
-- 적용: Supabase Dashboard → SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS public.lead_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  normalized_phone TEXT NOT NULL,
  memo TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_blacklist_normalized_phone
  ON public.lead_blacklist (normalized_phone);

CREATE INDEX IF NOT EXISTS idx_lead_blacklist_active_phone
  ON public.lead_blacklist (normalized_phone)
  WHERE is_active = true;

COMMENT ON TABLE public.lead_blacklist IS
  '블랙리스트: 동일 정규화 전화번호로 상담 신청 시 leads/tylife_b2b에 저장하지 않음';
