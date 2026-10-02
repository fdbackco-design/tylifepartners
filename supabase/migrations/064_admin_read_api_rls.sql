-- admin_read API 테이블: anon/authenticated 직접 접근 차단

ALTER TABLE public.admin_read_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_read_api_key_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_read_api_request_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.admin_read_api_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE public.admin_read_api_key_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.admin_read_api_request_logs FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_read_api_keys FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_read_api_key_permissions FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_read_api_request_logs FROM anon, authenticated;

GRANT ALL ON TABLE public.admin_read_api_keys TO service_role;
GRANT ALL ON TABLE public.admin_read_api_key_permissions TO service_role;
GRANT ALL ON TABLE public.admin_read_api_request_logs TO service_role;

DO $$ BEGIN
  CREATE POLICY admin_read_api_keys_deny_anon ON public.admin_read_api_keys FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY admin_read_api_keys_deny_authenticated ON public.admin_read_api_keys FOR ALL TO authenticated USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY admin_read_api_key_permissions_deny_anon ON public.admin_read_api_key_permissions FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY admin_read_api_key_permissions_deny_authenticated ON public.admin_read_api_key_permissions FOR ALL TO authenticated USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY admin_read_api_request_logs_deny_anon ON public.admin_read_api_request_logs FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY admin_read_api_request_logs_deny_authenticated ON public.admin_read_api_request_logs FOR ALL TO authenticated USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
