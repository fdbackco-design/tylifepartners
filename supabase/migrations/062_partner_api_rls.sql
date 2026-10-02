-- 파트너 API 관리 테이블: PostgREST anon/authenticated 직접 접근 차단
-- 서버(service_role)만 사용. 061 수정 없이 별도 적용.

ALTER TABLE public.partner_api_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_api_key_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_api_request_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.partner_api_clients FORCE ROW LEVEL SECURITY;
ALTER TABLE public.partner_api_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE public.partner_api_key_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.partner_api_request_logs FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.partner_api_clients FROM anon, authenticated;
REVOKE ALL ON TABLE public.partner_api_keys FROM anon, authenticated;
REVOKE ALL ON TABLE public.partner_api_key_permissions FROM anon, authenticated;
REVOKE ALL ON TABLE public.partner_api_request_logs FROM anon, authenticated;

GRANT ALL ON TABLE public.partner_api_clients TO service_role;
GRANT ALL ON TABLE public.partner_api_keys TO service_role;
GRANT ALL ON TABLE public.partner_api_key_permissions TO service_role;
GRANT ALL ON TABLE public.partner_api_request_logs TO service_role;

-- anon/authenticated 명시 거부 (이미 RLS만으로 0행이면 idempotent)
DO $$ BEGIN
  CREATE POLICY partner_api_clients_deny_anon ON public.partner_api_clients FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY partner_api_clients_deny_authenticated ON public.partner_api_clients FOR ALL TO authenticated USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY partner_api_keys_deny_anon ON public.partner_api_keys FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY partner_api_keys_deny_authenticated ON public.partner_api_keys FOR ALL TO authenticated USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY partner_api_key_permissions_deny_anon ON public.partner_api_key_permissions FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY partner_api_key_permissions_deny_authenticated ON public.partner_api_key_permissions FOR ALL TO authenticated USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY partner_api_request_logs_deny_anon ON public.partner_api_request_logs FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY partner_api_request_logs_deny_authenticated ON public.partner_api_request_logs FOR ALL TO authenticated USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- service_role은 Supabase API에서 RLS 우회. DDL·서버 코드는 service_role만 사용.
