/**
 * 관리자 읽기 API 키 1개 생성 (plaintext는 ADMIN_READ_KEY_OUT 파일에만 기록)
 * node --env-file=.env.local scripts/admin-read-api-provision-key.mjs
 */
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const outPath = process.env.ADMIN_READ_KEY_OUT;

if (!url || !serviceKey) {
  console.error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}
if (!outPath) {
  console.error("ADMIN_READ_KEY_OUT (쓰기 경로) 필수 — stdout에 api_key를 출력하지 않습니다.");
  process.exit(1);
}

const pepper = process.env.PARTNER_API_KEY_PEPPER || process.env.ADMIN_SESSION_SECRET || "partner-dev-pepper";
const plaintext = `ak_live_${randomBytes(24).toString("hex")}`;
const prefix = plaintext.slice(0, 16);
const hash = createHash("sha256").update(`${pepper}:admin-read:${plaintext}`).digest("hex");

const days = Number(process.env.ADMIN_READ_KEY_TTL_DAYS || 90);
const expires = new Date(Date.now() + days * 864e5);

const supabase = createClient(url, serviceKey);

const { data: keyRow, error: kErr } = await supabase
  .from("admin_read_api_keys")
  .insert({
    label: process.env.ADMIN_READ_KEY_LABEL || "provisioned",
    key_prefix: prefix,
    key_hash: hash,
    expires_at: expires.toISOString(),
    rate_limit_per_minute: Number(process.env.ADMIN_READ_RATE_LIMIT || 120),
  })
  .select("id")
  .single();

if (kErr) {
  console.error("key insert failed (063 migration 적용 여부 확인):", kErr.message);
  process.exit(1);
}

const { error: pErr } = await supabase.from("admin_read_api_key_permissions").insert({
  key_id: keyRow.id,
  allow_candidates: true,
  allow_tm001: true,
  allow_tm002: true,
  allow_calendar: true,
});

if (pErr) {
  console.error("permissions insert failed:", pErr.message);
  process.exit(1);
}

fs.writeFileSync(outPath, plaintext, { mode: 0o600 });
console.log(
  JSON.stringify(
    {
      key_id: keyRow.id,
      key_prefix: prefix,
      expires_at: expires.toISOString(),
      key_written: outPath,
    },
    null,
    2
  )
);
