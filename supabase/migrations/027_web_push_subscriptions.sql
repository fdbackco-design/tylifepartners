-- 웹 푸시 구독 (관리자 CRM 알림)
-- 적용: Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS public.web_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id UUID REFERENCES public.staff_users (id) ON DELETE CASCADE,
  login_id TEXT,
  rank TEXT NOT NULL DEFAULT 'sales'
    CHECK (rank IN ('admin', 'manager', 'sales')),
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_web_push_endpoint UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_web_push_staff
  ON public.web_push_subscriptions (staff_user_id)
  WHERE staff_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_web_push_rank
  ON public.web_push_subscriptions (rank);

CREATE INDEX IF NOT EXISTS idx_web_push_login
  ON public.web_push_subscriptions (login_id)
  WHERE login_id IS NOT NULL;

COMMENT ON TABLE public.web_push_subscriptions IS 'Web Push 구독 (관리자 신규 DB / 담당자 배정 알림)';
