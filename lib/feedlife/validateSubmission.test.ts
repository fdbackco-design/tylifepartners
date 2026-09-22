import test from "node:test";
import assert from "node:assert/strict";
import { validateSubmission, ValidationError } from "./validateSubmission";

const minimal = () => ({ name: "테스트", phone: "010-0000-0000", region: "서울", consentVersion: "2026-09-22.v5", consent: { requiredPrivacy: true, optionalConsultation: false, marketingUse: false } });
test("required consent alone permits submission without optional fields", () => {
  assert.equal(validateSubmission(minimal()).data.phone, "01000000000");
});
test("unconsented extra fields are discarded even when invalid", () => {
  const data = validateSubmission({ ...minimal(), ageBand: "invalid", currentRole: { unexpected: true } }).data;
  assert.equal(data.ageBand, undefined);
  assert.equal(data.currentRole, undefined);
});
test("consented optional fields use the supplied choices", () => {
  const payload = minimal(); payload.consent.optionalConsultation = true;
  assert.equal(validateSubmission({ ...payload, currentRole: "보험조직 관리자" }).data.currentRole, "보험조직 관리자");
  assert.throws(() => validateSubmission({ ...payload, ageBand: "unknown" }), ValidationError);
});
test("missing or string consent, stale version and marketing are rejected", () => {
  for (const patch of [{ consent: {} }, { consent: { requiredPrivacy: "true" } }, { consentVersion: "old" }, { consent: { requiredPrivacy: true, marketingUse: true } }]) {
    assert.throws(() => validateSubmission({ ...minimal(), ...patch }), ValidationError);
  }
});
