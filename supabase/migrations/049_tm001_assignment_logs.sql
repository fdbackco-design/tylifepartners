-- TM001 담당자 배정 이력
CREATE TABLE IF NOT EXISTS public.tm001_assignment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.tm001_customers (id) ON DELETE CASCADE,
  from_assignee_id UUID,
  to_assignee_id UUID,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by UUID,
  changed_by_name TEXT,
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_tm001_assignment_logs_customer
  ON public.tm001_assignment_logs (customer_id, assigned_at DESC);

COMMENT ON TABLE public.tm001_assignment_logs IS 'TM001 담당자 배정 변경 이력';
