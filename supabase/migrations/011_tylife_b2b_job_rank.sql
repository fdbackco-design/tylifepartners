-- B2B 상담 직급 (보험설계사 선택 시)
ALTER TABLE public.tylife_b2b ADD COLUMN IF NOT EXISTS job_rank TEXT;
