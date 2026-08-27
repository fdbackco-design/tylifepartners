-- 소비자 DB 목록 정렬/페이징 가속
CREATE INDEX IF NOT EXISTS idx_leads_created_at_desc
  ON public.leads (created_at DESC);

-- 목록에서 merge_status + 최신순이 자주 함께 쓰임
CREATE INDEX IF NOT EXISTS idx_leads_merge_created_at
  ON public.leads (merge_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tylife_b2b_merge_created_at
  ON public.tylife_b2b (merge_status, created_at DESC);
