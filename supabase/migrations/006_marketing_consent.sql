-- leads, tylife_b2b 테이블에 마케팅 정보 제공동의 컬럼 추가
-- 미동의: NULL, 동의: 1

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS marketing_consent SMALLINT;
ALTER TABLE public.tylife_b2b ADD COLUMN IF NOT EXISTS marketing_consent SMALLINT;

CREATE INDEX IF NOT EXISTS idx_leads_marketing_consent ON public.leads (marketing_consent);
CREATE INDEX IF NOT EXISTS idx_tylife_b2b_marketing_consent ON public.tylife_b2b (marketing_consent);

