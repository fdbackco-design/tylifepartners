-- 관리자/매니저 코멘트 (영업자 조회 전용, 메모와 분리)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS admin_comment TEXT;
ALTER TABLE public.tylife_b2b ADD COLUMN IF NOT EXISTS admin_comment TEXT;
