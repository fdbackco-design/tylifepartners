import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractLeadgenValues,
  normalizeMetaPhone,
  parseMetaLeadFields,
} from "@/lib/meta/leadAds";

describe("normalizeMetaPhone", () => {
  it("strips non-digits and converts +82", () => {
    assert.equal(normalizeMetaPhone("+82 10-1234-5678"), "01012345678");
    assert.equal(normalizeMetaPhone("010-1234-5678"), "01012345678");
  });
});

describe("parseMetaLeadFields", () => {
  it("maps common Instant Form fields", () => {
    const parsed = parseMetaLeadFields([
      { name: "full_name", values: ["김철수"] },
      { name: "phone_number", values: ["+82 10-9999-8888"] },
      { name: "email", values: ["a@b.com"] },
      { name: "city", values: ["서울"] },
    ]);
    assert.equal(parsed.name, "김철수");
    assert.equal(parsed.phone, "01099998888");
    assert.equal(parsed.email, "a@b.com");
    assert.equal(parsed.region, "서울");
  });

  it("maps Korean custom labels", () => {
    const parsed = parseMetaLeadFields([
      { name: "이름", values: ["이영희"] },
      { name: "연락처", values: ["01011112222"] },
    ]);
    assert.equal(parsed.name, "이영희");
    assert.equal(parsed.phone, "01011112222");
  });
});

describe("extractLeadgenValues", () => {
  it("reads leadgen_id from page webhook payload", () => {
    const values = extractLeadgenValues({
      object: "page",
      entry: [
        {
          id: "1",
          changes: [
            {
              field: "leadgen",
              value: {
                leadgen_id: "lead_1",
                form_id: "form_1",
                ad_id: "ad_1",
                adgroup_id: "adset_1",
              },
            },
          ],
        },
      ],
    });
    assert.equal(values.length, 1);
    assert.equal(values[0].leadgen_id, "lead_1");
    assert.equal(values[0].adgroup_id, "adset_1");
  });
});
