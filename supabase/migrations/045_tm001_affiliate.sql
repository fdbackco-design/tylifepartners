-- TM001 제휴 DB (관리자 전용)
-- 적용: Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS public.tm001_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code TEXT NOT NULL,
  partner_code TEXT NOT NULL DEFAULT '1',
  partner_name TEXT NOT NULL DEFAULT 'TM001',
  source_filename TEXT,
  uploaded_by UUID REFERENCES public.staff_users (id) ON DELETE SET NULL,
  uploaded_by_name TEXT,
  stay_row_count INT NOT NULL DEFAULT 0,
  customer_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tm001_batches_partner_batch
  ON public.tm001_batches (partner_code, batch_code);

CREATE TABLE IF NOT EXISTS public.tm001_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_code TEXT NOT NULL DEFAULT '1',
  partner_name TEXT NOT NULL DEFAULT 'TM001',
  batch_code TEXT NOT NULL DEFAULT '001',
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  normalized_phone TEXT NOT NULL,
  raw_phone TEXT,
  visit_count INT NOT NULL DEFAULT 0,
  assignee_id UUID REFERENCES public.staff_users (id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT '미접촉',
  product TEXT,
  memo TEXT NOT NULL DEFAULT '',
  comments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tm001_customers_partner_batch_phone
  ON public.tm001_customers (partner_code, batch_code, normalized_phone);

CREATE INDEX IF NOT EXISTS idx_tm001_customers_batch
  ON public.tm001_customers (batch_code);

CREATE INDEX IF NOT EXISTS idx_tm001_customers_status
  ON public.tm001_customers (status);

CREATE INDEX IF NOT EXISTS idx_tm001_customers_assignee
  ON public.tm001_customers (assignee_id);

CREATE INDEX IF NOT EXISTS idx_tm001_customers_phone
  ON public.tm001_customers (partner_code, normalized_phone);

CREATE TABLE IF NOT EXISTS public.tm001_stays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.tm001_customers (id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.tm001_batches (id) ON DELETE SET NULL,
  hotel_name TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  stay_type TEXT NOT NULL DEFAULT '',
  room TEXT NOT NULL DEFAULT '',
  raw_room TEXT NOT NULL DEFAULT '',
  raw_room_type TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  site_name TEXT NOT NULL DEFAULT '',
  confidence TEXT NOT NULL DEFAULT '',
  needs_review BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tm001_stays_customer
  ON public.tm001_stays (customer_id);

CREATE INDEX IF NOT EXISTS idx_tm001_stays_region
  ON public.tm001_stays (region);

CREATE INDEX IF NOT EXISTS idx_tm001_stays_batch
  ON public.tm001_stays (batch_id);

COMMENT ON TABLE public.tm001_batches IS 'TM001 제휴 DB 업로드 차수';
COMMENT ON TABLE public.tm001_customers IS 'TM001 제휴 고객 (같은 차수·연락처=1행, 다른 차수는 별도 행)';
COMMENT ON TABLE public.tm001_stays IS 'TM001 숙박 내역 (원본 보존)';
