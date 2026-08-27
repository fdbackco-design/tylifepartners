-- staff_users: 관리자(admin) 직급 허용 (계정 관리에서 DB 관리자 발급)
-- 적용: Supabase Dashboard → SQL Editor에서 실행

ALTER TABLE public.staff_users
  DROP CONSTRAINT IF EXISTS staff_users_rank_check;

ALTER TABLE public.staff_users
  ADD CONSTRAINT staff_users_rank_check
  CHECK (rank IN ('admin', 'manager', 'sales'));
