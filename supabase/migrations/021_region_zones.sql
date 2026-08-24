-- 고객 권역 정규화 컬럼 + 6개 고정 권역 시드
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS region_zone TEXT;
ALTER TABLE public.tylife_b2b ADD COLUMN IF NOT EXISTS region_zone TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_region_zone ON public.leads (region_zone);
CREATE INDEX IF NOT EXISTS idx_tylife_b2b_region_zone ON public.tylife_b2b (region_zone);

INSERT INTO public.assignment_rules (region_group, region_keywords, enabled)
VALUES
  ('수도권', ARRAY['서울','인천','경기','서울특별시','인천광역시','경기도'], true),
  ('충청권', ARRAY['대전','세종','충북','충남','대전광역시','세종특별자치시','충청북도','충청남도'], true),
  ('경상권', ARRAY['부산','대구','울산','경북','경남','부산광역시','대구광역시','울산광역시','경상북도','경상남도'], true),
  ('전라권', ARRAY['광주','전북','전남','광주광역시','전라북도','전라남도','전남광주'], true),
  ('강원권', ARRAY['강원','강원도','강원특별자치도'], true),
  ('제주권', ARRAY['제주','제주도','제주특별자치도'], true)
ON CONFLICT (region_group) DO UPDATE SET
  region_keywords = EXCLUDED.region_keywords;
