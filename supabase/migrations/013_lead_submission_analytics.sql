-- 상담 신청 시점 스크롤·섹션 스냅샷 (랜딩 분석 session_id 연결용)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS analytics_session_id TEXT,
  ADD COLUMN IF NOT EXISTS max_scroll_depth REAL,
  ADD COLUMN IF NOT EXISTS last_section_name TEXT,
  ADD COLUMN IF NOT EXISTS last_section_label TEXT;

ALTER TABLE public.tylife_b2b
  ADD COLUMN IF NOT EXISTS analytics_session_id TEXT,
  ADD COLUMN IF NOT EXISTS max_scroll_depth REAL,
  ADD COLUMN IF NOT EXISTS last_section_name TEXT,
  ADD COLUMN IF NOT EXISTS last_section_label TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_analytics_session_id ON public.leads (analytics_session_id);
CREATE INDEX IF NOT EXISTS idx_tylife_b2b_analytics_session_id ON public.tylife_b2b (analytics_session_id);
