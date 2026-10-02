/**
 * PARTNER_INTEGRATION=1 npm test -- lib/partner/integration.test.ts
 * 로컬 .env.local + migration 061 적용 + next dev(3000) 필요
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const run = process.env.PARTNER_INTEGRATION === "1";
const base = (process.env.PARTNER_API_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const key = process.env.PARTNER_TEST_API_KEY || "";

describe("partner API integration", { skip: !run || !key }, () => {
  it("인증 없으면 401", async () => {
    const res = await fetch(`${base}/api/partner/v1/candidates`);
    assert.equal(res.status, 401);
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, "unauthorized");
  });

  it("후보자 조회 200", async () => {
    const res = await fetch(`${base}/api/partner/v1/candidates?limit=1`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    assert.ok(res.status === 200 || res.status === 403);
    const body = (await res.json()) as { code?: string; items?: unknown[] };
    if (res.status === 403) {
      assert.ok(body.code === "forbidden" || body.code === "scope_not_configured");
      return;
    }
    assert.ok(Array.isArray(body.items));
  });

  it("캘린더 month 필수 형식", async () => {
    const res = await fetch(`${base}/api/partner/v1/calendar/events?month=bad`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.status === 403) return;
    assert.equal(res.status, 400);
  });
});
