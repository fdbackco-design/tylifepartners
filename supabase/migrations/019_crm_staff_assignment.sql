-- CRM: 영업자/매니저 계정, 지역 자동배정, 담당자·상태 이력, 대면 일정
-- 적용: Supabase Dashboard → SQL Editor에서 실행

-- 직원 계정 (관리자는 기존 ENV 로그인 유지)
CREATE TABLE IF NOT EXISTS public.staff_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  region TEXT,
  rank TEXT NOT NULL CHECK (rank IN ('manager', 'sales')),
  login_id TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  parent_id UUID REFERENCES public.staff_users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_users_parent ON public.staff_users (parent_id);
CREATE INDEX IF NOT EXISTS idx_staff_users_rank ON public.staff_users (rank);

CREATE TABLE IF NOT EXISTS public.crm_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.crm_settings (key, value)
VALUES ('auto_assign_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.assignment_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_group TEXT NOT NULL UNIQUE,
  region_keywords TEXT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assignment_rule_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.assignment_rules(id) ON DELETE CASCADE,
  staff_user_id UUID NOT NULL REFERENCES public.staff_users(id) ON DELETE CASCADE,
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight >= 1 AND weight <= 20),
  assigned_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (rule_id, staff_user_id)
);

INSERT INTO public.assignment_rules (region_group, region_keywords)
VALUES
  ('수도권', ARRAY['서울','인천','경기','서울특별시','인천광역시','경기도']),
  ('충청권', ARRAY['대전','세종','충북','충남','대전광역시','세종특별자치시','충청북도','충청남도']),
  ('경상권', ARRAY['부산','대구','울산','경북','경남','부산광역시','대구광역시','울산광역시','경상북도','경상남도'])
ON CONFLICT (region_group) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.lead_assignment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_table TEXT NOT NULL CHECK (lead_table IN ('leads', 'tylife_b2b')),
  lead_id UUID NOT NULL,
  from_assignee_id UUID,
  to_assignee_id UUID,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by UUID,
  changed_by_name TEXT,
  reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_lead_assignment_logs_lead ON public.lead_assignment_logs (lead_table, lead_id, assigned_at DESC);

CREATE TABLE IF NOT EXISTS public.lead_memo_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_table TEXT NOT NULL CHECK (lead_table IN ('leads', 'tylife_b2b')),
  lead_id UUID NOT NULL,
  assignee_id UUID,
  assignee_name TEXT,
  memo TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_memo_logs_lead ON public.lead_memo_logs (lead_table, lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.lead_status_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_table TEXT NOT NULL CHECK (lead_table IN ('leads', 'tylife_b2b')),
  lead_id UUID NOT NULL,
  from_status TEXT,
  to_status TEXT,
  assignee_id UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_lead_status_logs_changed ON public.lead_status_logs (changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_status_logs_to ON public.lead_status_logs (to_status, changed_at DESC);

-- leads CRM 컬럼
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES public.staff_users(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meeting_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS available_time TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS age_group TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS job TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS job_rank TEXT;

-- tylife_b2b CRM 컬럼
ALTER TABLE public.tylife_b2b ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES public.staff_users(id) ON DELETE SET NULL;
ALTER TABLE public.tylife_b2b ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE public.tylife_b2b ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;
ALTER TABLE public.tylife_b2b ADD COLUMN IF NOT EXISTS meeting_at TIMESTAMPTZ;

UPDATE public.leads SET region = location WHERE region IS NULL AND location IS NOT NULL;
UPDATE public.leads SET available_time = desired_time WHERE available_time IS NULL AND desired_time IS NOT NULL;
UPDATE public.leads SET status_changed_at = created_at WHERE status_changed_at IS NULL;
UPDATE public.tylife_b2b SET status_changed_at = created_at WHERE status_changed_at IS NULL;

UPDATE public.leads SET status = '상담완료' WHERE status IN ('상담 완료', '상담완료');
UPDATE public.tylife_b2b SET status = '상담완료' WHERE status IN ('상담 완료', '상담완료');

ALTER TABLE public.leads ALTER COLUMN status SET DEFAULT '배정전';
ALTER TABLE public.tylife_b2b ALTER COLUMN status SET DEFAULT '배정전';

CREATE INDEX IF NOT EXISTS idx_leads_assignee ON public.leads (assignee_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_meeting_at ON public.leads (meeting_at);
CREATE INDEX IF NOT EXISTS idx_tylife_b2b_assignee ON public.tylife_b2b (assignee_id);
CREATE INDEX IF NOT EXISTS idx_tylife_b2b_status ON public.tylife_b2b (status);
CREATE INDEX IF NOT EXISTS idx_tylife_b2b_meeting_at ON public.tylife_b2b (meeting_at);
