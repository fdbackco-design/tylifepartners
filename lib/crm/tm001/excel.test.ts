import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import { parseTm001HotDbWorkbook } from "@/lib/crm/tm001/excel";
import { formatMergedCustomerName, normalizeTm001Phone, parseRoomFromRaw } from "@/lib/crm/tm001/types";

describe("tm001 excel/types", () => {
  it("normalizes phones missing leading 0", () => {
    const p = normalizeTm001Phone("1028045786");
    assert.ok(p);
    assert.equal(p!.digits, "01028045786");
    assert.equal(p!.display, "010-2804-5786");
  });

  it("parses room from raw hotel(room)", () => {
    const r = parseRoomFromRaw("로긴리조트(블루룸)", "로긴리조트");
    assert.equal(r.room, "블루룸");
  });

  it("merges alternate names into parentheses", () => {
    assert.equal(formatMergedCustomerName(["홍조현", "홍조현", "고광남", "권영걸"]), "홍조현 (고광남, 권영걸)");
    assert.equal(formatMergedCustomerName(["홍조현"]), "홍조현");
  });

  it("parses hot DB workbook sample when present", () => {
    const path = "/tmp/tm001_hotdb.xlsx";
    if (!fs.existsSync(path)) {
      // CI without sample file
      return;
    }
    const buf = fs.readFileSync(path);
    const parsed = parseTm001HotDbWorkbook(buf);
    assert.ok(parsed.rows.length > 100);
    assert.ok(parsed.uniquePhones > 100);
    assert.match(parsed.sheetName, /숙박/);
    const sample = parsed.rows.find((r) => r.normalizedPhone === "01054902480");
    assert.ok(sample, "홍은섭 phone should exist in sample");
    assert.ok(sample!.hotelName);
  });
});
