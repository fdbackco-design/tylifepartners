-- tylife_b2b 테이블에 비즈니스 상담폼 필드 추가
-- 필수: region, available_time, age_group
-- 선택: job

ALTER TABLE public.tylife_b2b ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE public.tylife_b2b ADD COLUMN IF NOT EXISTS available_time TEXT;
ALTER TABLE public.tylife_b2b ADD COLUMN IF NOT EXISTS age_group TEXT;
ALTER TABLE public.tylife_b2b ADD COLUMN IF NOT EXISTS job TEXT;

