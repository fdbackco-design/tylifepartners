-- 외부 파트너 읽기 전용 API (키·권한·요청 로그)
-- Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS public.partner_api_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_email TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.partner_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.partner_api_clients(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  rate_limit_per_minute INT NOT NULL DEFAULT 60 CHECK (rate_limit_per_minute >= 1 AND rate_limit_per_minute <= 600),
  created_by UUID REFERENCES public.staff_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_api_keys_prefix_active
  ON public.partner_api_keys (key_prefix)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_partner_api_keys_client
  ON public.partner_api_keys (client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.partner_api_key_permissions (
  key_id UUID PRIMARY KEY REFERENCES public.partner_api_keys(id) ON DELETE CASCADE,
  allow_candidates BOOLEAN NOT NULL DEFAULT false,
  allow_tm001 BOOLEAN NOT NULL DEFAULT false,
  allow_tm002 BOOLEAN NOT NULL DEFAULT false,
  allow_calendar BOOLEAN NOT NULL DEFAULT false,
  -- 행 범위: 빈 배열이면 해당 리소스는 0건 (전체 조회 금지)
  candidate_utm_sources TEXT[] NOT NULL DEFAULT '{}',
  candidate_entry_pages TEXT[] NOT NULL DEFAULT '{}',
  candidate_regions TEXT[] NOT NULL DEFAULT '{}',
  tm001_batch_codes TEXT[] NOT NULL DEFAULT '{}',
  tm002_batch_codes TEXT[] NOT NULL DEFAULT '{}',
  calendar_event_types TEXT[] NOT NULL DEFAULT '{general,lecture,important,deadline,holiday}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.partner_api_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID REFERENCES public.partner_api_keys(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.partner_api_clients(id) ON DELETE SET NULL,
  method TEXT NOT NULL DEFAULT 'GET',
  path TEXT NOT NULL,
  status_code INT NOT NULL,
  duration_ms INT,
  ip TEXT,
  user_agent TEXT,
  query_summary TEXT NOT NULL DEFAULT '',
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_api_request_logs_key_time
  ON public.partner_api_request_logs (key_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_api_request_logs_rate
  ON public.partner_api_request_logs (key_id, created_at DESC)
  WHERE status_code < 500;
