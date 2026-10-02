/**
 * 관리자 읽기 API E2E (키 값 stdout 출력 없음)
 * ADMIN_READ_KEY_FILE=/path PARTNER_KEY_FILE=/path BASE=https://www.feed-life.com node scripts/admin-read-api-e2e.mjs
 */
import fs from "fs";

const base = (process.env.BASE || "http://127.0.0.1:3000").replace(/\/$/, "");

function readKeyFile(envName) {
  const path = process.env[envName] || "";
  if (!path) return "";
  return fs.readFileSync(path, "utf8").trim();
}

const adminKey = readKeyFile("ADMIN_READ_KEY_FILE") || process.env.ADMIN_READ_TEST_API_KEY || "";
const partnerKey = readKeyFile("PARTNER_KEY_FILE") || process.env.PARTNER_TEST_API_KEY || "";

if (!adminKey) {
  console.error("ADMIN_READ_KEY_FILE 또는 ADMIN_READ_TEST_API_KEY 필요");
  process.exit(1);
}

async function get(path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
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

const noAuth = await get("/api/admin-read/v1/candidates?limit=1");
results.push(["401 no auth", noAuth.status === 401 && noAuth.body?.code === "unauthorized"]);

const badAdmin = await get(
  "/api/admin-read/v1/candidates?limit=1",
  "ak_live_invalid000000000000000000000000000000000000"
);
results.push(["401 invalid admin key", badAdmin.status === 401 && badAdmin.body?.code === "unauthorized"]);

const okAdmin = await get("/api/admin-read/v1/candidates?limit=1", adminKey);
results.push(["200 admin candidates", okAdmin.status === 200 && Array.isArray(okAdmin.body?.items)]);

if (partnerKey) {
  const partnerOnAdmin = await get("/api/admin-read/v1/candidates?limit=1", partnerKey);
  results.push([
    "403 partner key on admin API",
    partnerOnAdmin.status === 403 && partnerOnAdmin.body?.code === "forbidden",
  ]);

  const adminOnPartner = await get("/api/partner/v1/candidates?limit=1", adminKey);
  results.push([
    "403 admin key on partner API",
    adminOnPartner.status === 403 && adminOnPartner.body?.code === "forbidden",
  ]);
} else {
  console.log("SKIP partner cross-tests (PARTNER_KEY_FILE 없음)");
}

const month = new Date().toISOString().slice(0, 7);
const cal = await get(`/api/admin-read/v1/calendar/events?month=${month}`, adminKey);
results.push(["200 admin calendar", cal.status === 200 && Array.isArray(cal.body?.items)]);

for (const [name, ok] of results) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
}
if (results.some(([, ok]) => !ok)) process.exit(1);
console.log("E2E OK", base);
