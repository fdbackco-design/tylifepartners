-- web_push_subscriptions: tm_admin 직급 구독 허용
-- 적용: Supabase Dashboard → SQL Editor 또는 supabase db push

ALTER TABLE public.web_push_subscriptions
  DROP CONSTRAINT IF EXISTS web_push_subscriptions_rank_check;

ALTER TABLE public.web_push_subscriptions
  ADD CONSTRAINT web_push_subscriptions_rank_check
  CHECK (rank IN ('admin', 'manager', 'sales', 'tm_admin'));

COMMENT ON CONSTRAINT web_push_subscriptions_rank_check ON public.web_push_subscriptions IS
  'admin/manager/sales/tm_admin 웹푸시 구독 허용';
