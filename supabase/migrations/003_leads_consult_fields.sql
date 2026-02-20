-- leads 테이블에 희망 상담일, 희망 상담시간, 사는 위치 컬럼 추가
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS desired_date TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS desired_time TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS location TEXT;
