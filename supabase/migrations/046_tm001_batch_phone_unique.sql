-- TM001: 연락처 unique를 (제휴사+차수+전화)로 변경 — 다른 차수 동일 고객은 별도 행
DROP INDEX IF EXISTS public.idx_tm001_customers_partner_phone;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tm001_customers_partner_batch_phone
  ON public.tm001_customers (partner_code, batch_code, normalized_phone);

CREATE INDEX IF NOT EXISTS idx_tm001_customers_phone
  ON public.tm001_customers (partner_code, normalized_phone);
