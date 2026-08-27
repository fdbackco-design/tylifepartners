-- 계정 목록에서 pbkdf2 비밀번호 검증 없이 invite 상태 판정
ALTER TABLE public.staff_users
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
