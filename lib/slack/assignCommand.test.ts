import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { parseAssignCommandText } from "@/lib/slack/assignCommand";
import { verifySlackRequestSignature } from "@/lib/slack/verify";

describe("parseAssignCommandText", () => {
  it("parses name + assignee", () => {
    const p = parseAssignCommandText("김성구 이주희");
    assert.equal(p.ok, true);
    if (!p.ok) return;
    assert.equal(p.leadQuery, "김성구");
    assert.equal(p.assigneeQuery, "이주희");
    assert.equal(p.unassign, false);
    assert.equal(p.category, "all");
  });

  it("parses phone + unassign", () => {
    const p = parseAssignCommandText("010-8647-0556 미배정");
    assert.equal(p.ok, true);
    if (!p.ok) return;
    assert.equal(p.leadQuery, "010-8647-0556");
    assert.equal(p.unassign, true);
  });

  it("parses category prefix", () => {
    const p = parseAssignCommandText("후보자 김성구 이주희");
    assert.equal(p.ok, true);
    if (!p.ok) return;
    assert.equal(p.category, "candidates");
    assert.equal(p.leadQuery, "김성구");
    assert.equal(p.assigneeQuery, "이주희");
  });

  it("returns help on empty", () => {
    const p = parseAssignCommandText("");
    assert.equal(p.ok, false);
    if (p.ok) return;
    assert.match(p.message, /사용법/);
  });
});

describe("verifySlackRequestSignature", () => {
  it("accepts valid signature", () => {
    const secret = "test_signing_secret";
    process.env.SLACK_SIGNING_SECRET = secret;
    const rawBody = "command=%2Fsetmember&text=%EA%B9%80%EC%84%B1%EA%B5%AC+%EC%9D%B4%EC%A3%BC%ED%9D%AC";
    const ts = "1710000000";
    const base = `v0:${ts}:${rawBody}`;
    const sig = `v0=${createHmac("sha256", secret).update(base, "utf8").digest("hex")}`;
    const result = verifySlackRequestSignature({
      rawBody,
      timestampHeader: ts,
      signatureHeader: sig,
      nowMs: 1710000000 * 1000,
    });
    assert.equal(result.ok, true);
  });

  it("rejects stale timestamp", () => {
    process.env.SLACK_SIGNING_SECRET = "test_signing_secret";
    const result = verifySlackRequestSignature({
      rawBody: "a=b",
      timestampHeader: "100",
      signatureHeader: "v0=abc",
      nowMs: Date.now(),
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "stale");
  });
});
