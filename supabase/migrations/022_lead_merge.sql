-- 고객(리드) 중복 병합: 정규화 전화, 병합 상태, 유입 이력, 병합 감사 로그
-- 적용: Supabase Dashboard → SQL Editor에서 실행

-- —— leads / tylife_b2b: 병합·정규화 컬럼 ——
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS normalized_phone TEXT,
  ADD COLUMN IF NOT EXISTS merge_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS merged_into_id UUID,
  ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ;

ALTER TABLE public.tylife_b2b
  ADD COLUMN IF NOT EXISTS normalized_phone TEXT,
  ADD COLUMN IF NOT EXISTS merge_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS merged_into_id UUID,
  ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_merge_status_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_merge_status_check
      CHECK (merge_status IN ('active', 'merged'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tylife_b2b_merge_status_check'
  ) THEN
    ALTER TABLE public.tylife_b2b
      ADD CONSTRAINT tylife_b2b_merge_status_check
      CHECK (merge_status IN ('active', 'merged'));
  END IF;
END $$;

UPDATE public.leads
SET normalized_phone = regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')
WHERE normalized_phone IS NULL OR normalized_phone = '';

UPDATE public.tylife_b2b
SET normalized_phone = regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')
WHERE normalized_phone IS NULL OR normalized_phone = '';

CREATE INDEX IF NOT EXISTS idx_leads_normalized_phone
  ON public.leads (normalized_phone)
  WHERE merge_status = 'active';

CREATE INDEX IF NOT EXISTS idx_tylife_b2b_normalized_phone
  ON public.tylife_b2b (normalized_phone)
  WHERE merge_status = 'active';

CREATE INDEX IF NOT EXISTS idx_leads_merge_status ON public.leads (merge_status);
CREATE INDEX IF NOT EXISTS idx_tylife_b2b_merge_status ON public.tylife_b2b (merge_status);

-- —— 광고/UTM 유입 이력 (행 단위 단일 컬럼 한계 보완) ——
CREATE TABLE IF NOT EXISTS public.lead_inbound_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_table TEXT NOT NULL CHECK (lead_table IN ('leads', 'tylife_b2b')),
  lead_id UUID NOT NULL,
  source_lead_id UUID,
  received_at TIMESTAMPTZ NOT NULL,
  name TEXT,
  phone TEXT,
  normalized_phone TEXT,
  source TEXT,
  entry_page TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lead_table, lead_id, source_lead_id)
);
CREATE INDEX IF NOT EXISTS idx_lead_inbound_logs_lead
  ON public.lead_inbound_logs (lead_table, lead_id, received_at DESC);

-- —— 병합 작업 / 그룹 감사 로그 ——
CREATE TABLE IF NOT EXISTS public.lead_merge_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_table TEXT NOT NULL CHECK (lead_table IN ('leads', 'tylife_b2b')),
  mode TEXT NOT NULL CHECK (mode IN ('dry_run', 'execute')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'partial')),
  executed_by UUID,
  executed_by_name TEXT,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.lead_merge_group_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.lead_merge_jobs(id) ON DELETE CASCADE,
  lead_table TEXT NOT NULL CHECK (lead_table IN ('leads', 'tylife_b2b')),
  normalized_phone TEXT NOT NULL,
  primary_lead_id UUID NOT NULL,
  source_lead_ids UUID[] NOT NULL DEFAULT '{}',
  primary_selection_reason TEXT NOT NULL,
  auto_merge BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL CHECK (status IN ('preview', 'skipped', 'success', 'failed')),
  skip_reasons TEXT[] NOT NULL DEFAULT '{}',
  before_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  moved_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, lead_table, normalized_phone)
);

CREATE INDEX IF NOT EXISTS idx_lead_merge_group_logs_job
  ON public.lead_merge_group_logs (job_id, status);

-- —— 그룹 단위 원자적 병합 (한 트랜잭션) ——
CREATE OR REPLACE FUNCTION public.merge_duplicate_lead_group(
  p_lead_table TEXT,
  p_primary_id UUID,
  p_source_ids UUID[],
  p_merged_memo TEXT,
  p_assignee_id UUID,
  p_assigned_at TIMESTAMPTZ,
  p_job_id UUID,
  p_normalized_phone TEXT,
  p_primary_reason TEXT,
  p_before_summary JSONB,
  p_inbound_rows JSONB DEFAULT '[]'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_src UUID;
  v_moved JSONB := '{}'::jsonb;
  v_cnt INT;
  v_now TIMESTAMPTZ := now();
  v_row JSONB;
  v_primary_active BOOLEAN;
BEGIN
  IF p_lead_table NOT IN ('leads', 'tylife_b2b') THEN
    RAISE EXCEPTION 'invalid lead_table';
  END IF;
  IF p_source_ids IS NULL OR array_length(p_source_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no source ids';
  END IF;

  -- 멱등: 이미 모두 병합된 경우 성공으로 반환
  IF p_lead_table = 'leads' THEN
    SELECT merge_status = 'active' INTO v_primary_active FROM public.leads WHERE id = p_primary_id;
  ELSE
    SELECT merge_status = 'active' INTO v_primary_active FROM public.tylife_b2b WHERE id = p_primary_id;
  END IF;
  IF v_primary_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'primary lead missing or not active';
  END IF;

  FOREACH v_src IN ARRAY p_source_ids LOOP
    IF p_lead_table = 'leads' THEN
      IF NOT EXISTS (SELECT 1 FROM public.leads WHERE id = v_src AND merge_status = 'active') THEN
        -- 이미 merged면 건너뜀 (멱등)
        CONTINUE;
      END IF;
    ELSE
      IF NOT EXISTS (SELECT 1 FROM public.tylife_b2b WHERE id = v_src AND merge_status = 'active') THEN
        CONTINUE;
      END IF;
    END IF;

    -- assignment logs: 중복(동일 from/to/assigned_at) 제외 후 이전
    UPDATE public.lead_assignment_logs a
    SET lead_id = p_primary_id,
        reason = COALESCE(a.reason, '') || CASE
          WHEN COALESCE(a.reason, '') LIKE '%merge_from:%' THEN ''
          ELSE CASE WHEN COALESCE(a.reason, '') = '' THEN 'merge_from:' || v_src::text
                    ELSE a.reason || '|merge_from:' || v_src::text END
        END
    WHERE a.lead_table = p_lead_table
      AND a.lead_id = v_src
      AND NOT EXISTS (
        SELECT 1 FROM public.lead_assignment_logs b
        WHERE b.lead_table = p_lead_table
          AND b.lead_id = p_primary_id
          AND b.from_assignee_id IS NOT DISTINCT FROM a.from_assignee_id
          AND b.to_assignee_id IS NOT DISTINCT FROM a.to_assignee_id
          AND b.assigned_at = a.assigned_at
      );
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_moved := jsonb_set(v_moved, '{assignment_logs}', to_jsonb(COALESCE((v_moved->>'assignment_logs')::int, 0) + v_cnt));

    -- 중복으로 남은 원본 assignment logs 삭제(이미 primary에 동일 건 존재)
    DELETE FROM public.lead_assignment_logs a
    WHERE a.lead_table = p_lead_table AND a.lead_id = v_src;

    UPDATE public.lead_memo_logs m
    SET lead_id = p_primary_id
    WHERE m.lead_table = p_lead_table
      AND m.lead_id = v_src
      AND NOT EXISTS (
        SELECT 1 FROM public.lead_memo_logs x
        WHERE x.lead_table = p_lead_table
          AND x.lead_id = p_primary_id
          AND x.memo IS NOT DISTINCT FROM m.memo
          AND x.created_at = m.created_at
          AND x.assignee_id IS NOT DISTINCT FROM m.assignee_id
      );
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_moved := jsonb_set(v_moved, '{memo_logs}', to_jsonb(COALESCE((v_moved->>'memo_logs')::int, 0) + v_cnt));
    DELETE FROM public.lead_memo_logs WHERE lead_table = p_lead_table AND lead_id = v_src;

    UPDATE public.lead_status_logs s
    SET lead_id = p_primary_id
    WHERE s.lead_table = p_lead_table
      AND s.lead_id = v_src
      AND NOT EXISTS (
        SELECT 1 FROM public.lead_status_logs x
        WHERE x.lead_table = p_lead_table
          AND x.lead_id = p_primary_id
          AND x.from_status IS NOT DISTINCT FROM s.from_status
          AND x.to_status IS NOT DISTINCT FROM s.to_status
          AND x.changed_at = s.changed_at
      );
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_moved := jsonb_set(v_moved, '{status_logs}', to_jsonb(COALESCE((v_moved->>'status_logs')::int, 0) + v_cnt));
    DELETE FROM public.lead_status_logs WHERE lead_table = p_lead_table AND lead_id = v_src;

    -- soft-merge source
    IF p_lead_table = 'leads' THEN
      UPDATE public.leads
      SET merge_status = 'merged',
          merged_into_id = p_primary_id,
          merged_at = v_now
      WHERE id = v_src AND merge_status = 'active';
    ELSE
      UPDATE public.tylife_b2b
      SET merge_status = 'merged',
          merged_into_id = p_primary_id,
          merged_at = v_now
      WHERE id = v_src AND merge_status = 'active';
    END IF;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_moved := jsonb_set(v_moved, '{merged_sources}', to_jsonb(COALESCE((v_moved->>'merged_sources')::int, 0) + v_cnt));
  END LOOP;

  -- inbound rows (멱등 UNIQUE)
  FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(p_inbound_rows, '[]'::jsonb))
  LOOP
    INSERT INTO public.lead_inbound_logs (
      lead_table, lead_id, source_lead_id, received_at, name, phone, normalized_phone,
      source, entry_page, utm_source, utm_medium, utm_campaign, utm_content, utm_term
    ) VALUES (
      p_lead_table,
      p_primary_id,
      NULLIF(v_row->>'source_lead_id', '')::uuid,
      COALESCE((v_row->>'received_at')::timestamptz, v_now),
      v_row->>'name',
      v_row->>'phone',
      v_row->>'normalized_phone',
      v_row->>'source',
      v_row->>'entry_page',
      v_row->>'utm_source',
      v_row->>'utm_medium',
      v_row->>'utm_campaign',
      v_row->>'utm_content',
      v_row->>'utm_term'
    )
    ON CONFLICT (lead_table, lead_id, source_lead_id) DO NOTHING;
  END LOOP;
  SELECT COUNT(*) INTO v_cnt FROM public.lead_inbound_logs
  WHERE lead_table = p_lead_table AND lead_id = p_primary_id;
  v_moved := jsonb_set(v_moved, '{inbound_logs_total}', to_jsonb(v_cnt));

  -- update primary
  IF p_lead_table = 'leads' THEN
    UPDATE public.leads
    SET memo = p_merged_memo,
        assignee_id = p_assignee_id,
        assigned_at = COALESCE(p_assigned_at, assigned_at),
        normalized_phone = COALESCE(NULLIF(p_normalized_phone, ''), normalized_phone)
    WHERE id = p_primary_id;
  ELSE
    UPDATE public.tylife_b2b
    SET memo = p_merged_memo,
        assignee_id = p_assignee_id,
        assigned_at = COALESCE(p_assigned_at, assigned_at),
        normalized_phone = COALESCE(NULLIF(p_normalized_phone, ''), normalized_phone)
    WHERE id = p_primary_id;
  END IF;

  INSERT INTO public.lead_merge_group_logs (
    job_id, lead_table, normalized_phone, primary_lead_id, source_lead_ids,
    primary_selection_reason, auto_merge, status, before_summary, moved_counts
  ) VALUES (
    p_job_id, p_lead_table, p_normalized_phone, p_primary_id, p_source_ids,
    p_primary_reason, true, 'success', COALESCE(p_before_summary, '{}'::jsonb), v_moved
  )
  ON CONFLICT (job_id, lead_table, normalized_phone) DO UPDATE
  SET status = 'success',
      moved_counts = EXCLUDED.moved_counts,
      error_message = NULL,
      primary_lead_id = EXCLUDED.primary_lead_id,
      source_lead_ids = EXCLUDED.source_lead_ids;

  RETURN jsonb_build_object('ok', true, 'moved', v_moved);
END;
$$;
