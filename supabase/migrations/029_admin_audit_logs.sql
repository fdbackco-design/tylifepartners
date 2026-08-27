-- 관리자/직원 활동 감사 로그
-- 적용: Supabase Dashboard → SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id UUID REFERENCES public.staff_users(id) ON DELETE SET NULL,
  actor_login_id TEXT NOT NULL DEFAULT '',
  actor_name TEXT NOT NULL DEFAULT '',
  actor_rank TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  summary TEXT NOT NULL DEFAULT '',
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created
  ON public.admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor
  ON public.admin_audit_logs (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action
  ON public.admin_audit_logs (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_resource
  ON public.admin_audit_logs (resource_type, resource_id, created_at DESC);
