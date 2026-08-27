-- 업무 캘린더 일정 (CRM)
-- 기존 leads/tylife_b2b.meeting_at 대면일은 API에서 가상 일정으로 병합 (호환)

CREATE TABLE IF NOT EXISTS public.crm_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  event_date DATE NOT NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('lecture', 'general', 'important', 'deadline', 'holiday', 'meeting')),
  all_day BOOLEAN NOT NULL DEFAULT true,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  -- all: 전체 열람 (관리자 생성 시 전원 / 매니저 생성 시 본인+팀만, 관리자 비공개)
  -- admin_plus: 관리자만
  -- managers: viewer_ids의 특정 매니저(+작성자)
  -- sales: viewer_ids의 특정 영업자(+작성자)
  visibility TEXT NOT NULL
    CHECK (visibility IN ('all', 'admin_plus', 'managers', 'sales')),
  viewer_ids UUID[] NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES public.staff_users(id) ON DELETE SET NULL,
  created_by_rank TEXT NOT NULL CHECK (created_by_rank IN ('admin', 'manager')),
  -- 매니저 작성 일정: 팀 루트(본인 id). 관리자 작성은 NULL
  team_root_id UUID REFERENCES public.staff_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_calendar_events_date
  ON public.crm_calendar_events (event_date);

CREATE INDEX IF NOT EXISTS idx_crm_calendar_events_created_by
  ON public.crm_calendar_events (created_by);

CREATE INDEX IF NOT EXISTS idx_crm_calendar_events_team_root
  ON public.crm_calendar_events (team_root_id)
  WHERE team_root_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_calendar_events_type
  ON public.crm_calendar_events (event_type);

CREATE INDEX IF NOT EXISTS idx_crm_calendar_events_viewer_ids
  ON public.crm_calendar_events USING GIN (viewer_ids);

COMMENT ON TABLE public.crm_calendar_events IS 'CRM 업무 캘린더 일정 (권한·열람범위 적용)';
COMMENT ON COLUMN public.crm_calendar_events.visibility IS 'all|admin_plus|managers|sales';
COMMENT ON COLUMN public.crm_calendar_events.team_root_id IS '매니저 작성 시 팀 스코프 루트(작성 매니저 id)';
