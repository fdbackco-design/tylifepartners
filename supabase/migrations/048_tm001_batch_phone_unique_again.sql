-- TM001: 같은 차수·동일 연락처는 1행 (다른 이름은 고객명 괄호 표기)
-- 이름별로 쪼개진 중복 행이 있으면 유니크 인덱스를 만들 수 없으므로 먼저 정리합니다.

DROP INDEX IF EXISTS public.idx_tm001_customers_partner_batch_phone_name;

-- 같은 (제휴사, 차수, 전화) 중복 고객 삭제 (숙박은 CASCADE)
DELETE FROM public.tm001_customers c
USING public.tm001_customers d
WHERE c.partner_code = d.partner_code
  AND c.batch_code = d.batch_code
  AND c.normalized_phone = d.normalized_phone
  AND c.id > d.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tm001_customers_partner_batch_phone
  ON public.tm001_customers (partner_code, batch_code, normalized_phone);
