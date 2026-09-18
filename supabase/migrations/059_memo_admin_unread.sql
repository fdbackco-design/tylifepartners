-- 영업자 수동 메모 수정 → 관리자 미확인 표시 (목록 SELECT만으로 표시, 조인 없음)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS memo_admin_unread BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.tylife_b2b
  ADD COLUMN IF NOT EXISTS memo_admin_unread BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.tm001_customers
  ADD COLUMN IF NOT EXISTS memo_admin_unread BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.leads.memo_admin_unread IS '영업자 수동 메모 수정 후 관리자 미열람';
COMMENT ON COLUMN public.tylife_b2b.memo_admin_unread IS '영업자 수동 메모 수정 후 관리자 미열람';
COMMENT ON COLUMN public.tm001_customers.memo_admin_unread IS '영업자 수동 메모 수정 후 관리자 미열람';
