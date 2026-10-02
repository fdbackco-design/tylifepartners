/**
 * anon 키로 파트너 관리 테이블 4종 조회 시 key_hash 등이 노출되지 않는지 검증
 * node --env-file=.env.local scripts/verify-partner-anon-block.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const sr = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !sr) {
  console.error("SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

const sb = createClient(url, sr);
const probeHash = "ANON_BLOCK_PROBE_HASH";
const { data: client, error: ce } = await sb
  .from("partner_api_clients")
  .insert({ name: "anon-block-probe", contact_email: "probe@local" })
  .select("id")
  .single();
if (ce) {
  console.error("probe setup failed:", ce.message);
  process.exit(1);
}
const { data: key, error: ke } = await sb
  .from("partner_api_keys")
  .insert({
    client_id: client.id,
    label: "probe",
    key_prefix: "pk_live_anonblk01",
    key_hash: probeHash,
  })
  .select("id")
  .single();
if (ke) {
  console.error("probe key failed:", ke.message);
  process.exit(1);
}
await sb.from("partner_api_key_permissions").insert({
  key_id: key.id,
  allow_candidates: true,
  candidate_utm_sources: ["probe_utm"],
});
await sb.from("partner_api_request_logs").insert({
  key_id: key.id,
  client_id: client.id,
  method: "GET",
  path: "/probe",
  status_code: 200,
  query_summary: "probe",
});

const checks = [
  ["partner_api_keys", "key_hash,key_prefix"],
  ["partner_api_key_permissions", "key_id,allow_candidates,candidate_utm_sources"],
  ["partner_api_request_logs", "path,query_summary,error_code"],
  ["partner_api_clients", "name,contact_email"],
];

let failed = false;
for (const [table, select] of checks) {
  const r = await fetch(`${url}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=20`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  });
  const text = await r.text();
  const leaked = text.includes(probeHash) || text.includes("anon-block-probe") || text.includes("probe_utm");
  const rows = (() => {
    try {
      const j = JSON.parse(text);
      return Array.isArray(j) ? j.length : -1;
    } catch {
      return -1;
    }
  })();
  console.log(`${table}: http=${r.status} rows=${rows} leaked=${leaked}`);
  if (leaked) failed = true;
}

await sb.from("partner_api_request_logs").delete().eq("key_id", key.id);
await sb.from("partner_api_key_permissions").delete().eq("key_id", key.id);
await sb.from("partner_api_keys").delete().eq("id", key.id);
await sb.from("partner_api_clients").delete().eq("id", client.id);

if (failed) {
  console.error("FAIL: anon이 민감 데이터를 읽을 수 있습니다.");
  process.exit(1);
}
console.log("OK: anon 직접 조회로 probe 데이터가 노출되지 않습니다.");
