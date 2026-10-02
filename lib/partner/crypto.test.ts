import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractBearerToken,
  generatePartnerApiKey,
  hashPartnerApiKey,
  isPartnerApiKeyFormat,
} from "@/lib/partner/crypto";

describe("partner crypto", () => {
  it("Bearer 추출", () => {
    assert.equal(extractBearerToken("Bearer pk_live_abc"), "pk_live_abc");
    assert.equal(extractBearerToken(null), null);
  });

  it("키 생성·해시 일관", () => {
    const { plaintext, hash } = generatePartnerApiKey();
    assert.ok(isPartnerApiKeyFormat(plaintext));
    assert.equal(hashPartnerApiKey(plaintext), hash);
  });
});
