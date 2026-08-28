-- 직원 최근 로그인 시각 (계정 관리 화면)
ALTER TABLE public.staff_users
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- 기존 감사 로그에서 최근 로그인 시각 백필
UPDATE public.staff_users u
SET last_login_at = sub.max_at
FROM (
  SELECT actor_user_id, MAX(created_at) AS max_at
  FROM public.admin_audit_logs
  WHERE action = 'login'
    AND success = true
    AND actor_user_id IS NOT NULL
  GROUP BY actor_user_id
) sub
WHERE u.id = sub.actor_user_id
  AND (u.last_login_at IS NULL OR u.last_login_at < sub.max_at);
