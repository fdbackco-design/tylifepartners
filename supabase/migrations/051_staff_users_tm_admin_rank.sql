-- staff_users 직급에 TM관리자(tm_admin) 추가
-- TM001 전체 조회·수정 전용 (다른 CRM 메뉴 비노출)

ALTER TABLE public.staff_users
  DROP CONSTRAINT IF EXISTS staff_users_rank_check;

ALTER TABLE public.staff_users
  ADD CONSTRAINT staff_users_rank_check
  CHECK (rank IN ('admin', 'manager', 'sales', 'tm_admin'));

COMMENT ON CONSTRAINT staff_users_rank_check ON public.staff_users IS
  'admin=전체, manager=팀, sales=본인, tm_admin=TM001 전용';
