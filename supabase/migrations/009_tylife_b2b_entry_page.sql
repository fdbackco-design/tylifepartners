-- tylife_b2b 유입 랜딩 구분 컬럼 추가 (/business vs /sidejob 등)
ALTER TABLE public.tylife_b2b ADD COLUMN IF NOT EXISTS entry_page TEXT;

