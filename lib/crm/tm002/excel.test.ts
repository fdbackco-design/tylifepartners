import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";
import { parseJoinedAt, parseTm002Workbook } from "@/lib/crm/tm002/excel";
import { formatMergedCustomerName, normalizeTm002Phone } from "@/lib/crm/tm002/types";

const HEADER = ["아이디", "이름", "가입일", "flag", "카드번호", "연락처", "이메일", "레벨", "주소", "상세주소"];

function workbook(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("tm002 excel/types", () => {
  it("adds the missing leading 0 so phones become 010…", () => {
    const p = normalizeTm002Phone("1032800306");
    assert.equal(p!.digits, "01032800306");
    assert.equal(p!.display, "010-3280-0306");
    assert.equal(normalizeTm002Phone("100103111"), null);
  });

  it("merges alternate names into parentheses", () => {
    assert.equal(formatMergedCustomerName(["홍조현", "홍조현", "고광남"]), "홍조현 (고광남)");
  });

  it("reads excel serial join dates as KST wall-clock", () => {
    // 43922.3599 = 2020-04-01 08:38:16 KST
    assert.equal(parseJoinedAt(43922.359907407408), "2020-03-31T23:38:16.000Z");
    assert.equal(parseJoinedAt("2020-04-01 08:38"), "2020-03-31T23:38:00.000Z");
    assert.equal(parseJoinedAt(""), null);
  });

  it("picks the biggest sheet with a header, skips title rows, keeps values as-is", () => {
    const buf = workbook({
      small: [
        ["원본에서 K 제외 list"],
        HEADER,
        ["a", "전소빈", 43922.36, "7 (10년)", "0030240569905122", 1032800306, "a@x.com", 5, "부산 중구 1", "504호"],
      ],
      big: [
        HEADER,
        ["a", "전소빈", 43922.36, "R(로얄클럽)", "0030240569905122", 1032800306, "a@x.com", "02", "부산 중구 1", "504호"],
        ["b", "김복희", 43923.5, "7", "0035274177854939", "010-5495-8274", "b@x.com", 4, "경기 의왕시", ""],
        ["c", "번호없음", 43923.5, "R", "1", "", "c@x.com", 4, "서울", ""],
      ],
    });
    const parsed = parseTm002Workbook(buf);
    assert.equal(parsed.sheetName, "big");
    assert.equal(parsed.rows.length, 2);
    assert.equal(parsed.issues.length, 1);
    const [first, second] = parsed.rows;
    assert.equal(first.phoneDisplay, "010-3280-0306");
    assert.equal(first.flag, "R(로얄클럽)");
    assert.equal(first.level, "02"); // 원문 그대로
    assert.equal(first.address, "부산 중구 1");
    assert.equal(first.addressDetail, "504호");
    assert.equal(second.normalizedPhone, "01054958274");
    assert.ok(!JSON.stringify(parsed).includes("0030240569905122"), "카드번호는 읽지 않는다");
  });
});
