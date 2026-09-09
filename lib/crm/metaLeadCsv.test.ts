import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMetaLeadCsv } from "@/lib/crm/metaLeadCsv";

describe("parseMetaLeadCsv", () => {
  it("parses utf-16 tab Meta lead export", () => {
    const header = [
      "id",
      "created_time",
      "ad_id",
      "ad_name",
      "adset_id",
      "adset_name",
      "campaign_id",
      "campaign_name",
      "form_id",
      "form_name",
      "is_organic",
      "platform",
      "지역",
      "상담가능시간",
      "연령대",
      "직업",
      "직급",
      "이름",
      "phone_number",
      "lead_status",
      "전화번호",
    ].join("\t");
    const row = [
      "l:1490781726402688",
      "2026-09-03T13:45:58+09:00",
      "ag:120253263282510729",
      "설계사모집_카드뉴스",
      "as:120253263282520729",
      "09_영업자모집_set",
      "c:120253263282490729",
      "2026_09_피드라이프_영업자_모집_광고",
      "f:1065059372932876",
      "260903_FEEDLIFE_영업자모집_DB_찐최종",
      "false",
      "ig",
      "서울",
      "오후",
      "30대",
      "보험설계사",
      "팀장_이상",
      "오동현",
      "p:+821023395214",
      "complete",
      "",
    ].join("\t");
    // utf-16 LE with BOM
    const text = `${header}\n${row}\n`;
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
    const parsed = parseMetaLeadCsv(buf);
    assert.equal(parsed.issues.length, 0);
    assert.equal(parsed.rows.length, 1);
    const r = parsed.rows[0];
    assert.equal(r.meta_lead_id, "1490781726402688");
    assert.equal(r.name, "오동현");
    assert.equal(r.phone, "01023395214");
    assert.equal(r.region, "서울");
    assert.equal(r.job_rank, "팀장 이상");
    assert.equal(r.ad_id, "120253263282510729");
    assert.equal(r.form_id, "1065059372932876");
  });

  it("parses CP949 comma Meta lead export (Windows Ads Manager)", () => {
    // 실제 Ads Manager 다운로드(콤마·CP949) 2행 샘플
    const buf = Buffer.from(
      "69642c637265617465645f74696d652c61645f69642c61645f6e616d652c61647365745f69642c61647365745f6e616d652c63616d706169676e5f69642c63616d706169676e5f6e616d652c666f726d5f69642c666f726d5f6e616d652c69735f6f7267616e69632c706c6174666f726d2cc1f6bfaa2cbbf3b4e3b0a1b4c9bdc3b0a32cbfacb7c9b4eb2cc1f7bef72cc1f7b1de2cc0ccb8a72c70686f6e655f6e756d6265722c6c6561645f7374617475730a323238323338343233353838333536342c323032362d30392d30395430373a34333a32352b30393a30302c3132303235333236333238323531303732392cbcb3b0e8bbe7b8f0c1fd5fc4abb5e5b4babdba2c3132303235333236333238323532303732392c30395fbfb5bef7c0dab8f0c1fd5f7365742c3132303235333236333238323439303732392c323032365f30395fc7c7b5e5b6f3c0ccc7c15fbfb5bef7c0da5fb8f0c1fd5fb1a4b0ed2c313036353035393337323933323837362c3236303930335f464545444c4946455fbfb5bef7c0dab8f0c1fd5f44425fc2f0c3d6c1be2c66616c73652c69672cbacebbea2cbfc0c0fc2c3530b4eb2cbab8c7e8bcb3b0e8bbe72cc6c0c0e55fc0ccbbf32cb1e8c0bac1d62c2b3832313039333335313630372c636f6d706c6574650a",
      "hex"
    );
    const parsed = parseMetaLeadCsv(buf);
    assert.equal(parsed.issues.length, 0, parsed.issues.map((i) => i.message).join("; "));
    assert.equal(parsed.rows.length, 1);
    const r = parsed.rows[0];
    assert.equal(r.meta_lead_id, "2282384235883564");
    assert.equal(r.name, "김은주");
    assert.equal(r.phone, "01093351607");
    assert.equal(r.region, "부산");
    assert.equal(r.available_time, "오전");
    assert.equal(r.age_group, "50대");
    assert.equal(r.job, "보험설계사");
    assert.equal(r.job_rank, "팀장 이상");
    assert.equal(r.ad_id, "120253263282510729");
  });
});
