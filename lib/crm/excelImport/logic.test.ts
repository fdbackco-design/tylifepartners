import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendStepMemos,
  dedupeRowsByPhone,
  excelDateToYmd,
  formatStepMemoBlock,
  matchStaffByLabel,
  memoAlreadyHasStepBlock,
  normalizeAssigneeLabel,
  parseExcelRowByPosition,
  planAssignmentLogs,
  planMemoBlocks,
  transferKey,
} from "@/lib/crm/excelImport/logic";

describe("excel import parse by column position", () => {
  it("maps 1~7 assignee/memo by index not header name", () => {
    const row = parseExcelRowByPosition(2, [
      new Date(2026, 1, 21),
      "홍길동",
      "010-1234-5678",
      "김담당",
      "1차 메모",
      "이담당",
      "2차 메모",
      null,
      "",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    assert.equal(row.normalizedPhone, "01012345678");
    assert.equal(row.inboundDate, "2026-02-21");
    assert.equal(row.steps[0].assigneeName, "김담당");
    assert.equal(row.steps[0].memo, "1차 메모");
    assert.equal(row.steps[1].assigneeName, "이담당");
    assert.equal(row.steps[1].memo, "2차 메모");
  });
});

describe("dedupe phone rows", () => {
  it("keeps latest inbound; tie uses lower row", () => {
    const a = parseExcelRowByPosition(2, ["2026-01-01", "A", "01011112222", "x", "m", ...Array(12).fill("")]);
    const b = parseExcelRowByPosition(3, ["2026-02-01", "A", "010-1111-2222", "x", "m", ...Array(12).fill("")]);
    const c = parseExcelRowByPosition(4, ["2026-02-01", "A", "01011112222", "x", "m2", ...Array(12).fill("")]);
    const { selected, excluded } = dedupeRowsByPhone([a, b, c]);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].excelRowNumber, 4);
    assert.equal(excluded.length, 2);
  });
});

describe("staff name matching", () => {
  const staff = [
    { id: "1", name: "안성준" },
    { id: "2", name: "정성은" },
    { id: "3", name: "황솜결" },
    { id: "4", name: "이재원" },
    { id: "5", name: "손성훈" },
    { id: "6", name: "장동욱" },
  ];
  it("strips titles and 레벨업 / digits regardless of spacing", () => {
    assert.equal(normalizeAssigneeLabel("안성준대표"), "안성준");
    assert.equal(normalizeAssigneeLabel("이재원2팀장"), "이재원");
    assert.equal(normalizeAssigneeLabel("장동욱 레벨업"), "장동욱");
    assert.equal(matchStaffByLabel("안성준대표", staff).staff?.id, "1");
    assert.equal(matchStaffByLabel("정성은팀장", staff).staff?.id, "2");
    assert.equal(matchStaffByLabel("황솜결 레벨업", staff).staff?.id, "3");
    assert.equal(matchStaffByLabel("이재원2", staff).staff?.id, "4");
    assert.equal(matchStaffByLabel("손성훈이사", staff).staff?.id, "5");
    assert.equal(matchStaffByLabel("장동욱레벨업", staff).staff?.id, "6");
  });
  it("matches when DB name has suffix and excel is bare", () => {
    const withSuffix = [
      { id: "a", name: "황솜결 레벨업" },
      { id: "b", name: "임태순 레벨업" },
    ];
    assert.equal(matchStaffByLabel("황솜결", withSuffix).staff?.id, "a");
    assert.equal(matchStaffByLabel("임태순팀장", withSuffix).staff?.id, "b");
  });
  it("collapses duplicate staff that differ only by suffix", () => {
    const dup = [
      { id: "short", name: "한서연" },
      { id: "long", name: "한서연 레벨업" },
    ];
    assert.equal(matchStaffByLabel("한서연 레벨업", dup).staff?.id, "long"); // exact raw
    assert.equal(matchStaffByLabel("한서연", dup).staff?.id, "short"); // bare preferred
    assert.equal(matchStaffByLabel("한서연2", dup).staff?.id, "short");
  });
  it("unknown assignee warns", () => {
    const r = matchStaffByLabel("없는사람", staff);
    assert.equal(r.staff, null);
    assert.ok(r.warning);
  });
});

describe("assignment plan", () => {
  const staff = [
    { id: "a", name: "김" },
    { id: "b", name: "이" },
  ];
  const resolve = (n: string) => matchStaffByLabel(n, staff).staff;

  it("only steps with memo create history; skips consecutive same", () => {
    const uploadAt = new Date("2026-08-25T03:00:00.000Z");
    const { plans, appliedSteps, lastAssigneeId } = planAssignmentLogs({
      leadId: "lead1",
      uploadAt,
      resolveAssignee: resolve,
      steps: [
        { step: 1, assigneeName: "김", memo: "m1" },
        { step: 2, assigneeName: "김", memo: "m2" },
        { step: 3, assigneeName: "이", memo: "m3" },
        { step: 4, assigneeName: "이", memo: "" },
      ],
    });
    assert.deepEqual(appliedSteps, [1, 3]);
    assert.equal(plans.length, 2);
    assert.equal(plans[0].toAssigneeId, "a");
    assert.equal(plans[1].toAssigneeId, "b");
    assert.equal(lastAssigneeId, "b");
    assert.ok(plans[0].assignedAtIso < plans[1].assignedAtIso);
  });

  it("idempotent transfer keys", () => {
    const k1 = transferKey(["lead", "assignment", "1", "a", "m"]);
    const k2 = transferKey(["lead", "assignment", "1", "a", "m"]);
    assert.equal(k1, k2);
  });
});

describe("memo format", () => {
  it("appends step blocks with blank line and dedupes", () => {
    assert.equal(formatStepMemoBlock(1, "hello"), "1차 담당자\nhello");
    const once = appendStepMemos("", [
      { step: 1, memo: "첫번째" },
      { step: 2, memo: "두번째" },
    ]);
    assert.equal(once.nextMemo, "1차 담당자\n첫번째\n\n2차 담당자\n두번째");
    assert.ok(memoAlreadyHasStepBlock(once.nextMemo, 1, "첫번째"));
    const twice = appendStepMemos(once.nextMemo, [{ step: 1, memo: "첫번째" }]);
    assert.equal(twice.nextMemo, once.nextMemo);
    assert.deepEqual(twice.skipped, [1]);
  });

  it("adds memo without assignee", () => {
    const r = planMemoBlocks({
      leadId: "L",
      existingMemo: "기존",
      steps: [{ step: 1, assigneeName: "", memo: "단독메모" }],
    });
    assert.deepEqual(r.applied, [1]);
    assert.ok(r.nextMemo.includes("1차 담당자\n단독메모"));
  });
});

describe("excel date", () => {
  it("parses Date and string", () => {
    assert.equal(excelDateToYmd(new Date(2026, 7, 25)), "2026-08-25");
    assert.equal(excelDateToYmd("2026.8.25"), "2026-08-25");
  });
});
