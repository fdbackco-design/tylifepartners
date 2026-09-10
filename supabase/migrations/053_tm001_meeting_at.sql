-- TM001 재콜 일정 (캘린더 연동)
ALTER TABLE public.tm001_customers
  ADD COLUMN IF NOT EXISTS meeting_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tm001_customers_meeting_at
  ON public.tm001_customers (meeting_at)
  WHERE meeting_at IS NOT NULL;

COMMENT ON COLUMN public.tm001_customers.meeting_at IS '재콜 예약 시각 (캘린더 전화 약속으로 표시)';
