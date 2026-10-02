import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertResourceAllowed,
  hasCandidateRowScope,
  hasTm001RowScope,
} from "@/lib/partner/scope";
import type { PartnerApiPermissions } from "@/lib/partner/types";

function basePerm(over: Partial<PartnerApiPermissions> = {}): PartnerApiPermissions {
  return {
    key_id: "k",
    client_id: "c",
    client_name: "Test",
    label: "l",
    rate_limit_per_minute: 60,
    allow_candidates: false,
    allow_tm001: false,
    allow_tm002: false,
    allow_calendar: false,
    candidate_utm_sources: [],
    candidate_entry_pages: [],
    candidate_regions: [],
    tm001_batch_codes: [],
    tm002_batch_codes: [],
    calendar_event_types: ["general"],
    ...over,
  };
}

describe("partner scope", () => {
  it("후보자 행 범위는 utm·entry·region 중 하나 이상", () => {
    assert.equal(hasCandidateRowScope(basePerm()), false);
    assert.equal(
      hasCandidateRowScope(basePerm({ candidate_utm_sources: ["partner_a"] })),
      true
    );
  });

  it("TM001은 batch_code 없으면 scope_not_configured", () => {
    const p = basePerm({ allow_tm001: true, tm001_batch_codes: [] });
    const r = assertResourceAllowed(p, "tm001");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "scope_not_configured");
  });

  it("TM001 batch 설정 시 허용", () => {
    const p = basePerm({ allow_tm001: true, tm001_batch_codes: ["014"] });
    assert.equal(assertResourceAllowed(p, "tm001").ok, true);
  });

  it("후보자 권한 없으면 forbidden", () => {
    const p = basePerm({ candidate_utm_sources: ["x"] });
    const r = assertResourceAllowed(p, "candidates");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "forbidden");
  });
});
