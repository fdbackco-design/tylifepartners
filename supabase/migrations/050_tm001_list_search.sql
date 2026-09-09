-- TM001 목록 검색/필터 가속: 인덱스 + RPC

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_tm001_customers_partner_updated
  ON public.tm001_customers (partner_code, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tm001_customers_partner_status_updated
  ON public.tm001_customers (partner_code, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tm001_customers_name_trgm
  ON public.tm001_customers USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_tm001_customers_phone_trgm
  ON public.tm001_customers USING gin (phone gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_tm001_customers_norm_phone_trgm
  ON public.tm001_customers USING gin (normalized_phone gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_tm001_stays_region_customer
  ON public.tm001_stays (region, customer_id);

CREATE INDEX IF NOT EXISTS idx_tm001_stays_hotel_trgm
  ON public.tm001_stays USING gin (hotel_name gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.tm001_list_regions()
RETURNS text[]
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    array_agg(r ORDER BY r),
    ARRAY[]::text[]
  )
  FROM (
    SELECT DISTINCT trim(region) AS r
    FROM public.tm001_stays
    WHERE region IS NOT NULL AND trim(region) <> ''
  ) t;
$$;

CREATE OR REPLACE FUNCTION public.tm001_list_customers(
  p_partner_code text DEFAULT 'TM001',
  p_q text DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_assignee_ids uuid[] DEFAULT NULL,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0,
  p_include_stay_total boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_pattern text;
  v_region text;
  v_status text;
  v_limit int;
  v_offset int;
  v_total int;
  v_stay_total bigint;
  v_items jsonb;
BEGIN
  v_limit := GREATEST(1, LEAST(coalesce(p_limit, 20), 100));
  v_offset := GREATEST(0, coalesce(p_offset, 0));
  v_region := nullif(trim(coalesce(p_region, '')), '');
  v_status := nullif(trim(coalesce(p_status, '')), '');

  v_pattern := nullif(trim(coalesce(p_q, '')), '');
  IF v_pattern IS NOT NULL THEN
    v_pattern := '%' || replace(replace(replace(v_pattern, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  WITH matched AS (
    SELECT c.id, c.updated_at, c.visit_count
    FROM public.tm001_customers c
    WHERE c.partner_code = p_partner_code
      AND (v_status IS NULL OR c.status = v_status)
      AND (p_assignee_ids IS NULL OR c.assignee_id = ANY (p_assignee_ids))
      AND (
        v_pattern IS NULL
        OR c.name ILIKE v_pattern ESCAPE '\'
        OR c.phone ILIKE v_pattern ESCAPE '\'
        OR c.normalized_phone ILIKE v_pattern ESCAPE '\'
        OR EXISTS (
          SELECT 1
          FROM public.tm001_stays s
          WHERE s.customer_id = c.id
            AND s.hotel_name ILIKE v_pattern ESCAPE '\'
        )
      )
      AND (
        v_region IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.tm001_stays s2
          WHERE s2.customer_id = c.id
            AND s2.region = v_region
        )
      )
  ),
  counted AS (
    SELECT
      count(*)::int AS total,
      coalesce(sum(visit_count), 0)::bigint AS stay_total
    FROM matched
  ),
  page AS (
    SELECT m.id, m.updated_at
    FROM matched m
    ORDER BY m.updated_at DESC NULLS LAST
    LIMIT v_limit OFFSET v_offset
  )
  SELECT
    (SELECT total FROM counted),
    CASE
      WHEN p_include_stay_total THEN (SELECT stay_total FROM counted)
      ELSE -1
    END,
    coalesce(
      (
        SELECT jsonb_agg(to_jsonb(c) ORDER BY p.updated_at DESC NULLS LAST)
        FROM page p
        JOIN public.tm001_customers c ON c.id = p.id
      ),
      '[]'::jsonb
    )
  INTO v_total, v_stay_total, v_items;

  RETURN jsonb_build_object(
    'total', coalesce(v_total, 0),
    'stay_total', coalesce(v_stay_total, 0),
    'items', coalesce(v_items, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.tm001_list_customers IS 'TM001 고객 목록 검색/필터/페이징';
COMMENT ON FUNCTION public.tm001_list_regions IS 'TM001 숙박 지역 distinct 목록';
