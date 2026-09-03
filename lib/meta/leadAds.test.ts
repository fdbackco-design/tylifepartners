import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractLeadgenValues,
  isMetaTestDummyValue,
  maskRawPhoneForLog,
  normalizeMetaPhone,
  parseMetaLeadFields,
  syntheticTestPhoneFromLeadId,
} from "@/lib/meta/leadAds";

describe("normalizeMetaPhone", () => {
  it("strips non-digits and converts +82", () => {
    assert.equal(normalizeMetaPhone("+82 10-1234-5678"), "01012345678");
    assert.equal(normalizeMetaPhone("010-1234-5678"), "01012345678");
  });
});

describe("isMetaTestDummyValue", () => {
  it("detects Meta Testing Tool placeholders", () => {
    assert.equal(isMetaTestDummyValue("<test lead: dummy data for phone_number>"), true);
    assert.equal(isMetaTestDummyValue("<test lead: dummy data for 이름>"), true);
    assert.equal(isMetaTestDummyValue("01012345678"), false);
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
    assert.equal(parsed.rawPhone, "+82 10-9999-8888");
    assert.equal(parsed.email, "a@b.com");
    assert.equal(parsed.region, "서울");
    assert.equal(parsed.phoneIsTestDummy, false);
  });

  it("maps Korean custom labels including 휴대전화 and name", () => {
    const parsed = parseMetaLeadFields([
      { name: "이름", values: ["이영희"] },
      { name: "휴대전화", values: ["01011112222"] },
    ]);
    assert.equal(parsed.name, "이영희");
    assert.equal(parsed.phone, "01011112222");
  });

  it("maps phone / 전화번호 / mobile_phone aliases", () => {
    for (const key of ["phone", "전화번호", "휴대폰", "mobile_phone"] as const) {
      const parsed = parseMetaLeadFields([{ name: key, values: ["01033334444"] }]);
      assert.equal(parsed.phone, "01033334444", key);
    }
  });

  it("reads values[0] and marks Meta test dummy phone", () => {
    const parsed = parseMetaLeadFields([
      { name: "이름", values: ["<test lead: dummy data for 이름>"] },
      { name: "phone_number", values: ["<test lead: dummy data for phone_number>"] },
      { name: "지역", values: ["<test lead: dummy data for 지역>"] },
    ]);
    assert.equal(parsed.phoneIsTestDummy, true);
    assert.equal(parsed.nameIsTestDummy, true);
    assert.equal(parsed.phone, "");
    assert.equal(parsed.region, null);
    assert.equal(maskRawPhoneForLog(parsed.rawPhone), "(meta-test-dummy)");
    assert.equal(syntheticTestPhoneFromLeadId("1588967209367237").length, 11);
  });

  it("accepts non-array values string", () => {
    const parsed = parseMetaLeadFields([
      { name: "name", values: "홍길동" as unknown as string[] },
      { name: "phone_number", values: "01055556666" as unknown as string[] },
    ]);
    assert.equal(parsed.name, "홍길동");
    assert.equal(parsed.phone, "01055556666");
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
