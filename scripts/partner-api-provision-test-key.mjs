/**
 * 로컬/스테이징: 파트너 API 테스트 키 1개 생성 (stdout에 api_key 1회 출력)
 * 사용: node --env-file=.env.local scripts/partner-api-provision-test-key.mjs
 */
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

const pepper = process.env.PARTNER_API_KEY_PEPPER || process.env.ADMIN_SESSION_SECRET || "partner-dev-pepper";
const plaintext = `pk_live_${randomBytes(24).toString("hex")}`;
const prefix = plaintext.slice(0, 16);
const hash = createHash("sha256").update(`${pepper}:${plaintext}`).digest("hex");

const supabase = createClient(url, key);

const { data: client, error: cErr } = await supabase
  .from("partner_api_clients")
  .insert({ name: "API Smoke Test Client", contact_email: "test@example.com", notes: "auto provision" })
  .select("id")
  .single();

if (cErr) {
  console.error("client insert failed (061 migration 적용 여부 확인):", cErr.message);
  process.exit(1);
}

const { data: keyRow, error: kErr } = await supabase
  .from("partner_api_keys")
  .insert({
    client_id: client.id,
    label: "smoke-test",
    key_prefix: prefix,
    key_hash: hash,
    rate_limit_per_minute: 120,
  })
  .select("id")
  .single();

if (kErr) {
  console.error("key insert failed:", kErr.message);
  process.exit(1);
}

const utm = process.env.PARTNER_TEST_UTM_SOURCE || "smoke_test_utm";
const batch = process.env.PARTNER_TEST_TM001_BATCH || "999";

const { error: pErr } = await supabase.from("partner_api_key_permissions").insert({
  key_id: keyRow.id,
  allow_candidates: true,
  allow_tm001: true,
  allow_tm002: false,
  allow_calendar: true,
  candidate_utm_sources: [utm],
  candidate_entry_pages: [],
  candidate_regions: [],
  tm001_batch_codes: [batch],
  tm002_batch_codes: [],
  calendar_event_types: ["general", "lecture", "important", "deadline", "holiday"],
});

if (pErr) {
  console.error("permissions insert failed:", pErr.message);
  process.exit(1);
}

const outPath = process.env.PARTNER_KEY_OUT;
if (outPath) {
  fs.writeFileSync(outPath, plaintext, { mode: 0o600 });
  console.log(JSON.stringify({ key_id: keyRow.id, client_id: client.id, utm, batch, key_written: outPath }, null, 2));
} else {
  console.log(JSON.stringify({ api_key: plaintext, key_id: keyRow.id, client_id: client.id, utm, batch }, null, 2));
}
