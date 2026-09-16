-- 개인정보/마케팅 동의 이력 (lead_consents)
-- 적용: Supabase Dashboard → SQL Editor
-- 기존 leads.marketing_consent / tylife_b2b.marketing_consent 컬럼은 유지합니다.

CREATE TABLE IF NOT EXISTS public.lead_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL,
  -- feedlife = public.leads (소비자), tylife_b2b = public.tylife_b2b (후보자)
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

CREATE INDEX IF NOT EXISTS idx_lead_consents_lead
  ON public.lead_consents (lead_type, lead_id, consented_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_consents_tm_eligible
  ON public.lead_consents (lead_type, lead_id)
  WHERE marketing_consent = true
    AND ad_phone_consent = true
    AND withdrawn_at IS NULL;

COMMENT ON TABLE public.lead_consents IS '개인정보·마케팅·광고채널 동의 이력 (덮어쓰기 금지, append-only)';
COMMENT ON COLUMN public.lead_consents.lead_type IS 'feedlife=leads(소비자), tylife_b2b=후보자';
COMMENT ON COLUMN public.lead_consents.consent_version IS '예: 2026-09-v1';

-- 최신 동의 1건 (철회 여부 포함). CRM·TM 필터용
CREATE OR REPLACE VIEW public.lead_consents_latest AS
SELECT DISTINCT ON (lead_type, lead_id)
  id,
  lead_id,
  lead_type,
  privacy_required,
  custom_info_consent,
  marketing_consent,
  ad_phone_consent,
  ad_sms_consent,
  ad_kakao_consent,
  ad_email_consent,
  consent_version,
  consent_source,
  consented_at,
  withdrawn_at,
  ip_address,
  user_agent,
  created_at
FROM public.lead_consents
ORDER BY lead_type, lead_id, consented_at DESC, created_at DESC;

COMMENT ON VIEW public.lead_consents_latest IS '리드별 최신 동의 상태 (withdrawn_at 있으면 철회됨)';

-- 기존 marketing_consent=1 레거시 백필 (이력 없을 때만). TM 대상 유지를 위해 전화 광고 동의 포함.
INSERT INTO public.lead_consents (
  lead_id, lead_type,
  privacy_required, custom_info_consent, marketing_consent,
  ad_phone_consent, ad_sms_consent, ad_kakao_consent, ad_email_consent,
  consent_version, consent_source, consented_at
)
SELECT
  l.id,
  'feedlife',
  true,
  false,
  true,
  true,
  true,
  true,
  true,
  '2026-09-v1',
  'legacy_backfill',
  COALESCE(l.created_at, now())
FROM public.leads l
WHERE l.marketing_consent = 1
  AND NOT EXISTS (
    SELECT 1 FROM public.lead_consents c
    WHERE c.lead_id = l.id AND c.lead_type = 'feedlife'
  );

INSERT INTO public.lead_consents (
  lead_id, lead_type,
  privacy_required, custom_info_consent, marketing_consent,
  ad_phone_consent, ad_sms_consent, ad_kakao_consent, ad_email_consent,
  consent_version, consent_source, consented_at
)
SELECT
  t.id,
  'tylife_b2b',
  true,
  false,
  true,
  true,
  true,
  true,
  true,
  '2026-09-v1',
  'legacy_backfill',
  COALESCE(t.created_at, now())
FROM public.tylife_b2b t
WHERE t.marketing_consent = 1
  AND NOT EXISTS (
    SELECT 1 FROM public.lead_consents c
    WHERE c.lead_id = t.id AND c.lead_type = 'tylife_b2b'
  );
