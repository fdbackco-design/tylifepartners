import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyDuplicateGroup,
  formatMergedMemoBlock,
  isValidNormalizedPhone,
  latestAssigneeFromLogs,
  memoAlreadyMerged,
  mergeAssignmentLogs,
  mergeMemos,
  normalizeLeadPhone,
  selectPrimaryLead,
  type MergeLeadCandidate,
} from "@/lib/crm/merge/logic";

function lead(partial: Partial<MergeLeadCandidate> & Pick<MergeLeadCandidate, "id" | "name" | "phone" | "created_at">): MergeLeadCandidate {
  return {
    memo: "",
    assignee_id: null,
    merge_status: "active",
    ...partial,
    normalized_phone: partial.normalized_phone ?? normalizeLeadPhone(partial.phone),
  };
}

describe("normalizeLeadPhone", () => {
  it("하이픈·공백이 다른 동일 번호를 같게 본다", () => {
    assert.equal(normalizeLeadPhone("010-1234-5678"), "01012345678");
    assert.equal(normalizeLeadPhone("010 1234 5678"), "01012345678");
    assert.equal(normalizeLeadPhone("01012345678"), "01012345678");
  });
});

describe("isValidNormalizedPhone", () => {
  it("짧거나 비정상 번호는 무효", () => {
    assert.equal(isValidNormalizedPhone(""), false);
    assert.equal(isValidNormalizedPhone("123"), false);
    assert.equal(isValidNormalizedPhone("15881234"), false);
    assert.equal(isValidNormalizedPhone("01012345678"), true);
  });
});

describe("selectPrimaryLead", () => {
  it("최신 유입일시 기준", () => {
    const { primary, reason } = selectPrimaryLead([
      lead({ id: "a", name: "김", phone: "01011112222", created_at: "2026-01-01T00:00:00.000Z" }),
      lead({ id: "b", name: "김", phone: "01011112222", created_at: "2026-02-01T00:00:00.000Z" }),
    ]);
    assert.equal(primary.id, "b");
    assert.match(reason, /유입일시/);
  });

  it("유입일시 같으면 생성일시 최신", () => {
    const t = "2026-03-01T00:00:00.000Z";
    const { primary } = selectPrimaryLead([
      lead({
        id: "a",
        name: "김",
        phone: "01011112222",
        created_at: "2026-01-01T00:00:00.000Z",
        received_at: t,
      }),
      lead({
        id: "b",
        name: "김",
        phone: "01011112222",
        created_at: "2026-02-01T00:00:00.000Z",
        received_at: t,
      }),
    ]);
    assert.equal(primary.id, "b");
  });

  it("생성일시도 같으면 가장 큰 PK", () => {
    const t = "2026-03-01T00:00:00.000Z";
    const { primary, reason } = selectPrimaryLead([
      lead({ id: "aaa", name: "김", phone: "01011112222", created_at: t, received_at: t }),
      lead({ id: "zzz", name: "김", phone: "01011112222", created_at: t, received_at: t }),
    ]);
    assert.equal(primary.id, "zzz");
    assert.match(reason, /PK/);
  });
});

describe("classifyDuplicateGroup", () => {
  it("고객명이 다르면 검토 대상", () => {
    const r = classifyDuplicateGroup([
      lead({ id: "1", name: "김철수", phone: "01012345678", created_at: "2026-01-01T00:00:00.000Z" }),
      lead({ id: "2", name: "이영희", phone: "010-1234-5678", created_at: "2026-02-01T00:00:00.000Z" }),
    ]);
    assert.equal(r.autoMerge, false);
    assert.ok(r.skipReasons.includes("name_mismatch"));
  });

  it("동일 이름·유효 번호면 자동 병합 가능", () => {
    const r = classifyDuplicateGroup([
      lead({ id: "1", name: "김철수", phone: "01012345678", created_at: "2026-01-01T00:00:00.000Z" }),
      lead({ id: "2", name: "김 철수", phone: "010-1234-5678", created_at: "2026-02-01T00:00:00.000Z" }),
    ]);
    assert.equal(r.autoMerge, true);
  });
});

describe("assignment & memo merge", () => {
  it("담당자 변경 이력 통합·중복 제거·최근 담당자", () => {
    const logs = mergeAssignmentLogs([
      { from_assignee_id: null, to_assignee_id: "s1", assigned_at: "2026-01-02T00:00:00.000Z" },
      { from_assignee_id: null, to_assignee_id: "s1", assigned_at: "2026-01-02T00:00:00.000Z" },
      { from_assignee_id: "s1", to_assignee_id: "s2", assigned_at: "2026-01-01T00:00:00.000Z" },
    ]);
    assert.equal(logs.length, 2);
    assert.equal(logs[0].to_assignee_id, "s2");
    const latest = latestAssigneeFromLogs(logs);
    assert.equal(latest.assigneeId, "s1");
  });

  it("메모 통합 및 중복 방지", () => {
    const primary = lead({
      id: "p",
      name: "김",
      phone: "01012345678",
      created_at: "2026-02-01T00:00:00.000Z",
      memo: "대표 메모",
    });
    const src = lead({
      id: "s",
      name: "김",
      phone: "01012345678",
      created_at: "2026-01-01T00:00:00.000Z",
      memo: "이전 메모",
    });
    const once = mergeMemos(primary, [src]);
    assert.ok(once.includes("원본 고객 ID: s"));
    assert.ok(once.includes("이전 메모"));
    const twice = mergeMemos({ ...primary, memo: once }, [src]);
    assert.equal(twice, once);
    assert.equal(memoAlreadyMerged(once, "s", "이전 메모"), true);
    assert.ok(formatMergedMemoBlock({ sourceId: "s", receivedAt: "t", memo: "x" }).includes("s"));
  });
});

describe("merged preservation semantics", () => {
  it("병합 고객은 classify에서 활성만으로 판정", () => {
    const r = classifyDuplicateGroup([
      lead({ id: "1", name: "김", phone: "01012345678", created_at: "2026-01-01T00:00:00.000Z" }),
      lead({
        id: "2",
        name: "김",
        phone: "01012345678",
        created_at: "2026-02-01T00:00:00.000Z",
        merge_status: "merged",
      }),
    ]);
    assert.ok(r.skipReasons.includes("single_record"));
    assert.equal(r.autoMerge, false);
  });
});
