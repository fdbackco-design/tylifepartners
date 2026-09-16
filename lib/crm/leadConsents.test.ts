import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_CONSENT_VERSION,
  legacyMarketingConsentFlag,
  parseConsentFromBody,
  toConsentSummary,
} from "@/lib/crm/leadConsents";

describe("parseConsentFromBody", () => {
  it("레거시 marketing_consent=1 만 오면 전 채널 동의로 간주", () => {
    const c = parseConsentFromBody({ marketing_consent: 1 }, { defaultSource: "landing" });
    assert.equal(c.marketing_consent, true);
    assert.equal(c.ad_phone_consent, true);
    assert.equal(c.ad_sms_consent, true);
    assert.equal(c.consent_version, DEFAULT_CONSENT_VERSION);
    assert.equal(c.consent_source, "landing");
    assert.equal(legacyMarketingConsentFlag(c), 1);
  });

  it("선택 동의 false여도 저장 가능한 입력을 만든다", () => {
    const c = parseConsentFromBody({
      privacy_required: true,
      custom_info_consent: false,
      marketing_consent: false,
      ad_phone_consent: false,
      ad_sms_consent: false,
      ad_kakao_consent: false,
      ad_email_consent: false,
      consent_version: "2026-09-v2",
    });
    assert.equal(c.privacy_required, true);
    assert.equal(c.marketing_consent, false);
    assert.equal(c.ad_phone_consent, false);
    assert.equal(legacyMarketingConsentFlag(c), null);
  });

  it("채널별 동의를 각각 반영한다", () => {
    const c = parseConsentFromBody({
      privacy_required: true,
      marketing_consent: true,
      ad_phone_consent: true,
      ad_sms_consent: false,
      ad_kakao_consent: true,
      ad_email_consent: false,
    });
    assert.equal(c.ad_phone_consent, true);
    assert.equal(c.ad_sms_consent, false);
    assert.equal(c.ad_kakao_consent, true);
    assert.equal(c.ad_email_consent, false);
  });
});

describe("toConsentSummary", () => {
  it("TM 대상은 마케팅+전화+미철회", () => {
    const s = toConsentSummary({
      id: "1",
      lead_id: "l1",
      lead_type: "feedlife",
      privacy_required: true,
      custom_info_consent: false,
      marketing_consent: true,
      ad_phone_consent: true,
      ad_sms_consent: false,
      ad_kakao_consent: false,
      ad_email_consent: false,
      consent_version: "2026-09-v1",
      consent_source: "landing",
      consented_at: "2026-09-15T00:00:00Z",
      withdrawn_at: null,
      ip_address: null,
      user_agent: null,
      created_at: "2026-09-15T00:00:00Z",
    });
    assert.equal(s?.tm_eligible, true);
    assert.equal(s?.is_active, true);
  });

  it("철회되면 TM 대상이 아니다", () => {
    const s = toConsentSummary({
      id: "1",
      lead_id: "l1",
      lead_type: "tylife_b2b",
      privacy_required: true,
      custom_info_consent: false,
      marketing_consent: true,
      ad_phone_consent: true,
      ad_sms_consent: true,
      ad_kakao_consent: true,
      ad_email_consent: true,
      consent_version: "2026-09-v1",
      consent_source: "crm_withdraw",
      consented_at: "2026-09-15T00:00:00Z",
      withdrawn_at: "2026-09-16T00:00:00Z",
      ip_address: null,
      user_agent: null,
      created_at: "2026-09-16T00:00:00Z",
    });
    assert.equal(s?.tm_eligible, false);
    assert.equal(s?.is_active, false);
  });
});
