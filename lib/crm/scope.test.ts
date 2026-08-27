import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canSeeMetaAdSpend, descendantAssigneeIds } from "@/lib/crm/scope";
import type { SessionUser } from "@/lib/crm/types";

describe("descendantAssigneeIds", () => {
  const staff = [
    { id: "mgr", parent_id: null },
    { id: "s1", parent_id: "mgr" },
    { id: "s2", parent_id: "mgr" },
    { id: "other-mgr", parent_id: null },
    { id: "other-s", parent_id: "other-mgr" },
  ];

  it("returns self only when no children", () => {
    assert.deepEqual(descendantAssigneeIds("s1", staff).sort(), ["s1"]);
  });

  it("returns self and direct reports for a manager", () => {
    assert.deepEqual(descendantAssigneeIds("mgr", staff).sort(), ["mgr", "s1", "s2"]);
  });

  it("does not include other org members", () => {
    const ids = descendantAssigneeIds("mgr", staff);
    assert.equal(ids.includes("other-s"), false);
    assert.equal(ids.includes("other-mgr"), false);
  });

  it("walks nested reports", () => {
    const nested = [
      { id: "a", parent_id: null },
      { id: "b", parent_id: "a" },
      { id: "c", parent_id: "b" },
    ];
    assert.deepEqual(descendantAssigneeIds("a", nested).sort(), ["a", "b", "c"]);
  });
});

describe("canSeeMetaAdSpend", () => {
  const base: SessionUser = {
    rank: "sales",
    userId: "u1",
    name: "테스트",
    loginId: "t",
    region: null,
    parentId: null,
  };

  it("allows admin only", () => {
    assert.equal(canSeeMetaAdSpend({ ...base, rank: "admin" }), true);
    assert.equal(canSeeMetaAdSpend({ ...base, rank: "manager" }), false);
    assert.equal(canSeeMetaAdSpend({ ...base, rank: "sales" }), false);
  });
});
