-- 고객별 랜딩 행동 분석 확장
-- 적용: Supabase Dashboard → SQL Editor

-- 1) 이벤트에 visitor / 리드 연결 / 중복 키
ALTER TABLE public.landing_events
  ADD COLUMN IF NOT EXISTS visitor_id TEXT,
  ADD COLUMN IF NOT EXISTS event_key TEXT,
  ADD COLUMN IF NOT EXISTS lead_table TEXT,
  ADD COLUMN IF NOT EXISTS lead_id UUID;

CREATE INDEX IF NOT EXISTS idx_landing_events_visitor_id
  ON public.landing_events (visitor_id)
  WHERE visitor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_landing_events_lead
  ON public.landing_events (lead_table, lead_id)
  WHERE lead_id IS NOT NULL;

-- 동일 세션·이벤트 키 중복 방지 (scroll_sample 등)
CREATE UNIQUE INDEX IF NOT EXISTS uq_landing_events_session_event_key
  ON public.landing_events (session_id, event_key)
  WHERE event_key IS NOT NULL;

COMMENT ON COLUMN public.landing_events.visitor_id IS '익명 방문자 ID (localStorage, 장기)';
COMMENT ON COLUMN public.landing_events.event_key IS '중복 방지 키 (예: scroll_sample:40)';
COMMENT ON COLUMN public.landing_events.lead_table IS '연결된 고객 테이블 leads|tylife_b2b';
COMMENT ON COLUMN public.landing_events.lead_id IS '연결된 고객 UUID';

-- 2) 고객 ↔ 방문 세션 다대다 (재방문·재유입 지원)
CREATE TABLE IF NOT EXISTS public.landing_lead_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_table TEXT NOT NULL CHECK (lead_table IN ('leads', 'tylife_b2b')),
  lead_id UUID NOT NULL,
  session_id TEXT NOT NULL,
  visitor_id TEXT,
  landing_key TEXT,
  page_url TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lead_table, lead_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_landing_lead_sessions_lead
  ON public.landing_lead_sessions (lead_table, lead_id, linked_at DESC);

CREATE INDEX IF NOT EXISTS idx_landing_lead_sessions_session
  ON public.landing_lead_sessions (session_id);

COMMENT ON TABLE public.landing_lead_sessions IS '상담 신청 시 session_id ↔ 고객 DB 연결 (복수 세션 허용)';

-- 3) 리드에 visitor 스냅샷 (선택 조회 편의)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS analytics_visitor_id TEXT;

ALTER TABLE public.tylife_b2b
  ADD COLUMN IF NOT EXISTS analytics_visitor_id TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_analytics_visitor
  ON public.leads (analytics_visitor_id)
  WHERE analytics_visitor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tylife_b2b_analytics_visitor
  ON public.tylife_b2b (analytics_visitor_id)
  WHERE analytics_visitor_id IS NOT NULL;

-- 4) 보관 정책: 기본 90일 초과 이벤트 삭제용 함수 (스케줄러/크론에서 호출)
CREATE OR REPLACE FUNCTION public.purge_landing_events_older_than(days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF days < 7 THEN
    RAISE EXCEPTION 'retention days must be >= 7';
  END IF;
  DELETE FROM public.landing_events
  WHERE created_at < now() - make_interval(days => days);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.purge_landing_events_older_than(integer) IS
  '랜딩 이벤트 보관 기간 정리. 예: SELECT purge_landing_events_older_than(90); 권장 cron: 매일';
