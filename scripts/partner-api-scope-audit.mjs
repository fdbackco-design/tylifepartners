/**
 * 키 권한 대비 응답 범위 점검 (service_role, 키 값 불필요)
 * node --env-file=.env.local scripts/partner-api-scope-audit.mjs [key_id]
 */
import { createClient } from "@supabase/supabase-js";

const keyId = process.argv[2];
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: keys, error: ke } = keyId
  ? await sb.from("partner_api_keys").select("id,label,revoked_at,client_id").eq("id", keyId)
  : await sb.from("partner_api_keys").select("id,label,revoked_at,client_id").is("revoked_at", null);
if (ke) throw new Error(ke.message);

for (const k of keys || []) {
  if (k.revoked_at) continue;
  const { data: p } = await sb.from("partner_api_key_permissions").select("*").eq("key_id", k.id).maybeSingle();
  if (!p) {
    console.log("key", k.id, "NO_PERMISSIONS");
    continue;
  }
  const issues = [];

  if (p.allow_candidates) {
    const utm = p.candidate_utm_sources || [];
    const ep = p.candidate_entry_pages || [];
    const reg = p.candidate_regions || [];
    if (!utm.length && !ep.length && !reg.length) issues.push("candidates: scope empty");
    let q = sb.from("tylife_b2b").select("id,utm_source,entry_page,region").or("merge_status.eq.active,merge_status.is.null").limit(500);
    if (utm.length) q = q.in("utm_source", utm);
    if (ep.length) q = q.in("entry_page", ep);
    if (reg.length) {
      const parts = reg.map((r) => `region.ilike.%${r.replace(/[,.()]/g, "")}%`);
      q = q.or(parts.join(","));
    }
    const { data: rows } = await q;
    for (const r of rows || []) {
      if (utm.length && !utm.includes(String(r.utm_source))) issues.push(`candidate leak utm ${r.id}`);
      if (ep.length && !ep.includes(String(r.entry_page))) issues.push(`candidate leak entry ${r.id}`);
    }
  }

  if (p.allow_tm001 && (p.tm001_batch_codes || []).length) {
    const batches = p.tm001_batch_codes;
    const { data: rows } = await sb
      .from("tm001_customers")
      .select("id,batch_code")
      .eq("partner_code", "1")
      .in("batch_code", batches)
      .limit(500);
    for (const r of rows || []) {
      if (!batches.includes(String(r.batch_code))) issues.push(`tm001 leak batch ${r.id}`);
    }
  }

  if (p.allow_tm002 && (p.tm002_batch_codes || []).length) {
    const batches = p.tm002_batch_codes;
    const { data: rows } = await sb
      .from("tm002_customers")
      .select("id,batch_code")
      .eq("partner_code", "2")
      .in("batch_code", batches)
      .limit(500);
    for (const r of rows || []) {
      if (!batches.includes(String(r.batch_code))) issues.push(`tm002 leak batch ${r.id}`);
    }
  }

  if (p.allow_calendar) {
    issues.push(
      p.calendar_event_types?.length
        ? "calendar: no per-partner row filter (all keys share admin visibility=all events)"
        : "calendar: scope empty"
    );
  }

  console.log(
    JSON.stringify({
      key_id: k.id,
      label: k.label,
      allow: {
        candidates: p.allow_candidates,
        tm001: p.allow_tm001,
        tm002: p.allow_tm002,
        calendar: p.allow_calendar,
      },
      scopes: {
        utm: p.candidate_utm_sources,
        entry_pages: p.candidate_entry_pages,
        regions: p.candidate_regions,
        tm001_batches: p.tm001_batch_codes,
        tm002_batches: p.tm002_batch_codes,
        calendar_types: p.calendar_event_types,
      },
      issues: issues.length ? issues : ["ok"],
    })
  );
}

if (!(keys || []).filter((k) => !k.revoked_at).length) {
  console.log("no_active_keys");
}
