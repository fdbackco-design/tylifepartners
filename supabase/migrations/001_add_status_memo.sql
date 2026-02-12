-- ============================================
-- leads 테이블에 상담 상태(status), 메모(memo) 컬럼 추가
-- Supabase Dashboard → SQL Editor에서 실행
-- (기존 테이블이 있는 경우 이 마이그레이션만 실행)
-- ============================================

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT '대기';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS memo TEXT;
