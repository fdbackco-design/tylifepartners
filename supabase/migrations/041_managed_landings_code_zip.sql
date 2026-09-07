-- 코드 ZIP 배포형 랜딩 (React/Next 소스 번들)
ALTER TABLE public.managed_landings
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'template';

ALTER TABLE public.managed_landings
  DROP CONSTRAINT IF EXISTS managed_landings_kind_check;

ALTER TABLE public.managed_landings
  ADD CONSTRAINT managed_landings_kind_check
  CHECK (kind IN ('template', 'code'));

ALTER TABLE public.managed_landings
  ADD COLUMN IF NOT EXISTS code_bundle_url TEXT;

ALTER TABLE public.managed_landings
  ADD COLUMN IF NOT EXISTS code_css_url TEXT;

ALTER TABLE public.managed_landings
  ADD COLUMN IF NOT EXISTS code_asset_base TEXT;

ALTER TABLE public.managed_landings
  ADD COLUMN IF NOT EXISTS code_meta JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.managed_landings.kind IS 'template=히어로템플릿, code=ZIP 소스 번들';
COMMENT ON COLUMN public.managed_landings.code_bundle_url IS '번들 JS(CJS) public URL';
COMMENT ON COLUMN public.managed_landings.code_css_url IS '추출 CSS public URL';
COMMENT ON COLUMN public.managed_landings.code_asset_base IS '에셋 public base URL (…/assets/)';
COMMENT ON COLUMN public.managed_landings.code_meta IS '원본 파일명·섹션 수 등 배포 메타';
