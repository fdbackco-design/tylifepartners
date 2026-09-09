-- TM001: 같은 차수에서 동일 연락처·다른 이름은 별도 고객 행
DROP INDEX IF EXISTS public.idx_tm001_customers_partner_batch_phone;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tm001_customers_partner_batch_phone_name
  ON public.tm001_customers (partner_code, batch_code, normalized_phone, name);
