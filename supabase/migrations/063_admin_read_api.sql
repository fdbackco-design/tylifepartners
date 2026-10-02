-- CRM 관리자 외부 읽기 전용 API (파트너 pk_live_ 키와 별도, ak_live_)

CREATE TABLE IF NOT EXISTS public.admin_read_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL DEFAULT '',
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  rate_limit_per_minute INT NOT NULL DEFAULT 120 CHECK (rate_limit_per_minute >= 1 AND rate_limit_per_minute <= 600),
  created_by UUID REFERENCES public.staff_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_read_api_keys_prefix_active
  ON public.admin_read_api_keys (key_prefix)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.admin_read_api_key_permissions (
  key_id UUID PRIMARY KEY REFERENCES public.admin_read_api_keys(id) ON DELETE CASCADE,
  allow_candidates BOOLEAN NOT NULL DEFAULT true,
  allow_tm001 BOOLEAN NOT NULL DEFAULT true,
  allow_tm002 BOOLEAN NOT NULL DEFAULT true,
  allow_calendar BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_read_api_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID REFERENCES public.admin_read_api_keys(id) ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS idx_admin_read_api_request_logs_key_time
  ON public.admin_read_api_request_logs (key_id, created_at DESC);
