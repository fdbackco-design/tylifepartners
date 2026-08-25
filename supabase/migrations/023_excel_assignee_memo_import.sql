-- 엑셀 담당자·메모 이관 (미리보기/적용/멱등)
-- 적용: Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS public.lead_excel_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_table TEXT NOT NULL DEFAULT 'leads'
    CHECK (lead_table IN ('leads', 'tylife_b2b', 'all')),
  mode TEXT NOT NULL CHECK (mode IN ('dry_run', 'execute')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'partial')),
  file_name TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_by UUID,
  executed_by_name TEXT,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.lead_excel_import_row_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.lead_excel_import_jobs(id) ON DELETE CASCADE,
  excel_row_number INT NOT NULL,
  normalized_phone TEXT,
  excel_name TEXT,
  excel_inbound_date TEXT,
  primary_lead_id UUID,
  lead_table TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'warning', 'failed', 'skipped')),
  reasons TEXT[] NOT NULL DEFAULT '{}',
  assignment_applied INT[] NOT NULL DEFAULT '{}',
  assignment_skipped INT[] NOT NULL DEFAULT '{}',
  memo_applied INT[] NOT NULL DEFAULT '{}',
  memo_skipped INT[] NOT NULL DEFAULT '{}',
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, excel_row_number)
);

CREATE TABLE IF NOT EXISTS public.lead_excel_import_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_table TEXT NOT NULL CHECK (lead_table IN ('leads', 'tylife_b2b')),
  lead_id UUID NOT NULL,
  transfer_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('assignment', 'memo')),
  step INT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  job_id UUID REFERENCES public.lead_excel_import_jobs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_excel_import_transfers_lead
  ON public.lead_excel_import_transfers (lead_table, lead_id, kind, step);

-- 한 엑셀 행(한 고객) 단위 원자 적용
CREATE OR REPLACE FUNCTION public.apply_excel_assignee_memo_import(
  p_job_id UUID,
  p_lead_table TEXT,
  p_lead_id UUID,
  p_assignee_id UUID,
  p_assigned_at TIMESTAMPTZ,
  p_merged_memo TEXT,
  p_assignments JSONB,
  p_memo_transfers JSONB
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_item JSONB;
  v_key TEXT;
  v_inserted_assign INT := 0;
  v_skipped_assign INT := 0;
  v_inserted_memo INT := 0;
  v_skipped_memo INT := 0;
  v_from UUID;
  v_to UUID;
  v_at TIMESTAMPTZ;
  v_reason TEXT;
  v_step INT;
BEGIN
  IF p_lead_table NOT IN ('leads', 'tylife_b2b') THEN
    RAISE EXCEPTION 'invalid lead_table';
  END IF;

  -- assignment logs (멱등: transfer_key)
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb))
  LOOP
    v_key := v_item->>'transfer_key';
    v_step := COALESCE((v_item->>'step')::int, 0);
    IF v_key IS NULL OR v_key = '' THEN
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.lead_excel_import_transfers WHERE transfer_key = v_key) THEN
      v_skipped_assign := v_skipped_assign + 1;
      CONTINUE;
    END IF;

    v_from := NULLIF(v_item->>'from_assignee_id', '')::uuid;
    v_to := NULLIF(v_item->>'to_assignee_id', '')::uuid;
    v_at := COALESCE((v_item->>'assigned_at')::timestamptz, p_assigned_at);
    v_reason := COALESCE(v_item->>'reason', 'excel_import');

    INSERT INTO public.lead_assignment_logs (
      lead_table, lead_id, from_assignee_id, to_assignee_id, assigned_at, changed_by_name, reason
    ) VALUES (
      p_lead_table, p_lead_id, v_from, v_to, v_at, 'excel_import', v_reason
    );

    INSERT INTO public.lead_excel_import_transfers (
      lead_table, lead_id, transfer_key, kind, step, payload, job_id
    ) VALUES (
      p_lead_table, p_lead_id, v_key, 'assignment', v_step, v_item, p_job_id
    );
    v_inserted_assign := v_inserted_assign + 1;
  END LOOP;

  -- memo transfers (본문은 이미 TS에서 합쳐 p_merged_memo로 전달, 키만 멱등 기록)
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_memo_transfers, '[]'::jsonb))
  LOOP
    v_key := v_item->>'transfer_key';
    v_step := COALESCE((v_item->>'step')::int, 0);
    IF v_key IS NULL OR v_key = '' THEN
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.lead_excel_import_transfers WHERE transfer_key = v_key) THEN
      v_skipped_memo := v_skipped_memo + 1;
      CONTINUE;
    END IF;
    INSERT INTO public.lead_excel_import_transfers (
      lead_table, lead_id, transfer_key, kind, step, payload, job_id
    ) VALUES (
      p_lead_table, p_lead_id, v_key, 'memo', v_step, v_item, p_job_id
    );
    v_inserted_memo := v_inserted_memo + 1;
  END LOOP;

  IF p_lead_table = 'leads' THEN
    UPDATE public.leads
    SET memo = COALESCE(p_merged_memo, memo),
        assignee_id = COALESCE(p_assignee_id, assignee_id),
        assigned_at = CASE
          WHEN p_assignee_id IS NOT NULL THEN COALESCE(p_assigned_at, assigned_at)
          ELSE assigned_at
        END
    WHERE id = p_lead_id;
  ELSE
    UPDATE public.tylife_b2b
    SET memo = COALESCE(p_merged_memo, memo),
        assignee_id = COALESCE(p_assignee_id, assignee_id),
        assigned_at = CASE
          WHEN p_assignee_id IS NOT NULL THEN COALESCE(p_assigned_at, assigned_at)
          ELSE assigned_at
        END
    WHERE id = p_lead_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'assignment_inserted', v_inserted_assign,
    'assignment_skipped', v_skipped_assign,
    'memo_inserted', v_inserted_memo,
    'memo_skipped', v_skipped_memo
  );
END;
$$;
