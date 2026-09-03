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
});
