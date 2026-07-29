-- ============================================
-- crm_sync_status: FEED Life CRM으로의 유입 동기화 상태 기록
-- (FEED Life CRM은 이 프로젝트와 완전히 별도의 Supabase 프로젝트이므로
-- 여기서는 "우리 쪽에서 본 동기화 시도 결과"만 기록한다)
--
-- 적용 전 확인사항: 회사 랜딩 Supabase에 동일한 이름의 테이블/타입이 이미
-- 존재하는지, 기존 스키마와 컬럼명이 충돌하지 않는지 먼저 검토할 것.
-- 검토 후 Preview 또는 별도 staging 프로젝트에 먼저 적용 -> 검증 -> 운영 적용 순서 권장.
--
-- 적용 방법: Supabase Dashboard -> SQL Editor에서 실행 (또는 supabase db push)
-- ============================================

CREATE TABLE IF NOT EXISTS public.crm_sync_status (
  submission_id UUID PRIMARY KEY,
  source_table TEXT NOT NULL CHECK (source_table IN ('leads', 'tylife_b2b')),
  crm_sync_status TEXT NOT NULL DEFAULT 'PENDING_RETRY'
    CHECK (crm_sync_status IN (
      'SYNCED_NEW_LEAD', 'SYNCED_REINQUIRY', 'PENDING_RETRY',
      'REJECTED_INVALID', 'ALREADY_PROCESSED'
    )),
  crm_synced_at TIMESTAMPTZ,
  crm_result JSONB,
  crm_retry_count INTEGER NOT NULL DEFAULT 0,
  crm_last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_sync_status_pending
  ON public.crm_sync_status (created_at)
  WHERE crm_sync_status = 'PENDING_RETRY';

COMMENT ON TABLE public.crm_sync_status IS
  'submission_id(=leads.id 또는 tylife_b2b.id) 1건당 FEED Life CRM 동기화 시도 결과. PENDING_RETRY 건은 관리자 재시도 엔드포인트(또는 배치)로 재시도 가능';
