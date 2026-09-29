-- TM002 (레저스테이션 회원 DB) — TM001과 동일한 콜 관리 구조, 숙박내역 대신 회원 정보 컬럼
-- 적용: Supabase Dashboard → SQL Editor
-- 카드번호·이메일·아이디는 요구사항에 없어 저장하지 않습니다.

CREATE TABLE IF NOT EXISTS public.tm002_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code TEXT NOT NULL,
  partner_code TEXT NOT NULL DEFAULT '2',
  partner_name TEXT NOT NULL DEFAULT 'TM002',
  source_filename TEXT,
  uploaded_by UUID REFERENCES public.staff_users (id) ON DELETE SET NULL,
  uploaded_by_name TEXT,
  stay_row_count INT NOT NULL DEFAULT 0,
  customer_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tm002_batches_partner_batch
  ON public.tm002_batches (partner_code, batch_code);

CREATE TABLE IF NOT EXISTS public.tm002_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_code TEXT NOT NULL DEFAULT '2',
  partner_name TEXT NOT NULL DEFAULT 'TM002',
  batch_code TEXT NOT NULL DEFAULT '001',
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  normalized_phone TEXT NOT NULL,
  raw_phone TEXT,
  -- 엑셀 원본 컬럼 (가공하지 않고 그대로 보관)
  joined_at TIMESTAMPTZ,
  flag TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  address_detail TEXT NOT NULL DEFAULT '',
  -- TM001과 동일한 콜 관리 컬럼
  assignee_id UUID REFERENCES public.staff_users (id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT '미접촉',
  product TEXT,
  meeting_at TIMESTAMPTZ,
  memo TEXT NOT NULL DEFAULT '',
  memo_admin_unread BOOLEAN NOT NULL DEFAULT false,
  comments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 같은 차수·동일 연락처는 1행 (다른 이름은 고객명 괄호 표기)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tm002_customers_partner_batch_phone
  ON public.tm002_customers (partner_code, batch_code, normalized_phone);

CREATE INDEX IF NOT EXISTS idx_tm002_customers_status ON public.tm002_customers (status);
CREATE INDEX IF NOT EXISTS idx_tm002_customers_assignee ON public.tm002_customers (assignee_id);
CREATE INDEX IF NOT EXISTS idx_tm002_customers_updated ON public.tm002_customers (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tm002_customers_meeting_at
  ON public.tm002_customers (meeting_at)
  WHERE meeting_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.tm002_assignment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.tm002_customers (id) ON DELETE CASCADE,
  from_assignee_id UUID,
  to_assignee_id UUID,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by UUID,
  changed_by_name TEXT,
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_tm002_assignment_logs_customer
  ON public.tm002_assignment_logs (customer_id, assigned_at DESC);

COMMENT ON TABLE public.tm002_batches IS 'TM002 업로드 차수';
COMMENT ON TABLE public.tm002_customers IS 'TM002 레저스테이션 회원 (같은 차수·연락처=1행)';
COMMENT ON TABLE public.tm002_assignment_logs IS 'TM002 담당자 배정 변경 이력';
COMMENT ON COLUMN public.tm002_customers.meeting_at IS '재콜 예약 시각 (캘린더 전화 약속으로 표시)';
COMMENT ON COLUMN public.tm002_customers.memo_admin_unread IS '영업자 수동 메모 수정 후 관리자 미열람';
