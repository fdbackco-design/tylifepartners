import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 서버 전용 Supabase 클라이언트 (Service Role Key)
 * 클라이언트에는 이 키를 노출하지 말 것.
 *
 * [바꿔야 하는 곳 - SUPABASE]
 * Vercel/로컬 .env.local에 설정:
 * - SUPABASE_URL: Supabase 프로젝트 URL (Dashboard → Settings → API)
 * - SUPABASE_SERVICE_ROLE_KEY: Supabase Service Role Key
 *
 * Next.js App Router는 기본적으로 fetch 결과를 캐시한다.
 * Supabase REST 조회가 캐시되면 managed_landings.form_config 등 설정 변경이
 * 공개 페이지에 반영되지 않으므로 항상 no-store로 둔다.
 */
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function createNoStoreFetch(): typeof fetch {
  return (input, init) =>
    fetch(input, {
      ...init,
      cache: "no-store",
    });
}

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  if (!adminClient) {
    adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: { fetch: createNoStoreFetch() },
    });
  }
  return adminClient;
}
