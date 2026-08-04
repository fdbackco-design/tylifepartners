-- 관리형 랜딩 상담 신청 폼 설정
ALTER TABLE public.managed_landings
  ADD COLUMN IF NOT EXISTS form_config JSONB NOT NULL DEFAULT '{
    "includeAvailableTime": true,
    "allowRegionDetail": true,
    "includeAgeGroup": true,
    "includeJob": true
  }'::jsonb;

COMMENT ON COLUMN public.managed_landings.form_config IS
  '상담 신청 폼 옵션: includeAvailableTime, allowRegionDetail, includeAgeGroup, includeJob';
