-- B2C leads: 랜딩 경로(/, /v2, /v3, /me 등) 저장
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS entry_page TEXT;
