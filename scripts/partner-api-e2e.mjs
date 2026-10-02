/**
 * 파트너 API E2E (키 값 stdout 출력 없음)
 * PARTNER_KEY_FILE=/path/to/file BASE=https://host node scripts/partner-api-e2e.mjs
 */
import fs from "fs";

const base = (process.env.BASE || "http://127.0.0.1:3000").replace(/\/$/, "");
const keyFile = process.env.PARTNER_KEY_FILE || "";
let partnerKey = process.env.PARTNER_TEST_API_KEY || "";
if (keyFile) {
  partnerKey = fs.readFileSync(keyFile, "utf8").trim();
}
if (!partnerKey) {
  console.error("PARTNER_KEY_FILE 또는 PARTNER_TEST_API_KEY 필요");
  process.exit(1);
}

async function req(path, auth = false) {
  const headers = auth ? { Authorization: `Bearer ${partnerKey}` } : {};
  const r = await fetch(`${base}${path}`, { headers });
  let body;
  try {
    body = await r.json();
  } catch {
    body = null;
  }
  return { status: r.status, body };
}

const results = [];

const noAuth = await req("/api/partner/v1/candidates?limit=1", false);
results.push(["401 no auth candidates", noAuth.status === 401 && noAuth.body?.code === "unauthorized"]);

const badKeyRes = await fetch(`${base}/api/partner/v1/candidates?limit=1`, {
  headers: { Authorization: "Bearer pk_live_invalid000000000000000000000000000000000000" },
});
const badBody = await badKeyRes.json().catch(() => ({}));
results.push(["401 invalid key", badKeyRes.status === 401 && badBody.code === "unauthorized"]);

const cand = await req("/api/partner/v1/candidates?limit=1", true);
results.push(["200 candidates", cand.status === 200 && Array.isArray(cand.body?.items)]);

const tm001 = await req("/api/partner/v1/tm001/customers?limit=1", true);
results.push(["200 tm001", tm001.status === 200 && Array.isArray(tm001.body?.items)]);

const tm002 = await req("/api/partner/v1/tm002/customers?limit=1", true);
results.push([
  "403 tm002 forbidden",
  tm002.status === 403 && (tm002.body?.code === "forbidden" || tm002.body?.code === "scope_not_configured"),
]);

const month = new Date().toISOString().slice(0, 7);
const cal = await req(`/api/partner/v1/calendar/events?month=${month}`, true);
results.push(["200 calendar", cal.status === 200 && Array.isArray(cal.body?.items)]);

for (const [name, ok] of results) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
}
if (results.some(([, ok]) => !ok)) process.exit(1);
console.log("E2E OK", base);
