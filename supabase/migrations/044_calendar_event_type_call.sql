-- 캘린더 event_type에 통화약속(call) 추가
ALTER TABLE public.crm_calendar_events
  DROP CONSTRAINT IF EXISTS crm_calendar_events_event_type_check;

ALTER TABLE public.crm_calendar_events
  ADD CONSTRAINT crm_calendar_events_event_type_check
  CHECK (event_type IN ('lecture', 'general', 'important', 'deadline', 'holiday', 'meeting', 'call'));
