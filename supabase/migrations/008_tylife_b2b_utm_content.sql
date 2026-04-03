-- tylife_b2b 테이블에 utm_content 컬럼 추가 (leads와 동일 UTM 세트)
ALTER TABLE public.tylife_b2b ADD COLUMN IF NOT EXISTS utm_content TEXT;
