-- 소비자/후보자 DB 목록에서만 숨김 (실제 리드 삭제 아님)
-- 적용: Supabase Dashboard → SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS public.lead_list_hides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_table TEXT NOT NULL CHECK (lead_table IN ('leads', 'tylife_b2b')),
  lead_id UUID NOT NULL,
  hidden_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hidden_by_user_id UUID REFERENCES public.staff_users(id) ON DELETE SET NULL,
  hidden_by_login_id TEXT NOT NULL DEFAULT '',
  hidden_by_name TEXT NOT NULL DEFAULT '',
  hidden_by_rank TEXT NOT NULL DEFAULT '',
  UNIQUE (lead_table, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_list_hides_table_lead
  ON public.lead_list_hides (lead_table, lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_list_hides_hidden_at
  ON public.lead_list_hides (hidden_at DESC);
