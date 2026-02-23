-- leads 테이블에 UTM 추적 컬럼 추가
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS utm_content TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS utm_term TEXT;

-- utm_source 인덱스 (플랫폼별 분석용)
CREATE INDEX IF NOT EXISTS idx_leads_utm_source ON public.leads (utm_source);
