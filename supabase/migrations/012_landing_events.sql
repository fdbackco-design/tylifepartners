-- 랜딩페이지 행동 분석 이벤트 (비식별 session_id, 좌표 비율 기반)
CREATE TABLE IF NOT EXISTS public.landing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_key TEXT NOT NULL,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  page_url TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  section_name TEXT,
  section_label TEXT,
  depth REAL,
  max_depth REAL,
  duration_seconds REAL,
  x_ratio REAL,
  y_ratio REAL,
  viewport_width INTEGER,
  viewport_height INTEGER,
  document_height INTEGER,
  device_type TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_landing_events_landing_key ON public.landing_events (landing_key);
CREATE INDEX IF NOT EXISTS idx_landing_events_session_id ON public.landing_events (session_id);
CREATE INDEX IF NOT EXISTS idx_landing_events_event_type ON public.landing_events (event_type);
CREATE INDEX IF NOT EXISTS idx_landing_events_created_at ON public.landing_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_landing_events_landing_created ON public.landing_events (landing_key, created_at DESC);

COMMENT ON TABLE public.landing_events IS '랜딩 스크롤/클릭/체류 분석 (개인 식별 정보 미저장)';
