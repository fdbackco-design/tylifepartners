import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccessAdminPath,
  canAccessCrmLeads,
  canAccessTm001,
  canAssignTm001To,
  canChangeTm001Assignee,
  canExportLeads,
  canSeeMetaAdSpend,
  defaultAdminHome,
  descendantAssigneeIds,
  tm001VisibleAssigneeIdsFromStaff,
} from "@/lib/crm/scope";
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
    assert.equal(canSeeMetaAdSpend({ ...base, rank: "tm_admin" }), false);
  });
});

describe("canExportLeads", () => {
  const base: SessionUser = {
    rank: "sales",
    userId: "u1",
    name: "테스트",
    loginId: "t",
    region: null,
    parentId: null,
  };

  it("allows admin only", () => {
    assert.equal(canExportLeads({ ...base, rank: "admin" }), true);
    assert.equal(canExportLeads({ ...base, rank: "manager" }), false);
    assert.equal(canExportLeads({ ...base, rank: "sales" }), false);
    assert.equal(canExportLeads({ ...base, rank: "tm_admin" }), false);
  });
});

describe("tm_admin scope", () => {
  const tm: SessionUser = {
    rank: "tm_admin",
    userId: "tm1",
    name: "TM",
    loginId: "tm",
    region: null,
    parentId: null,
  };

  it("homes to tm001 and only allows tm001/password paths", () => {
    assert.equal(defaultAdminHome("tm_admin"), "/admin/tm001");
    assert.equal(canAccessAdminPath("tm_admin", "/admin/tm001"), true);
    assert.equal(canAccessAdminPath("tm_admin", "/admin/password"), true);
    assert.equal(canAccessAdminPath("tm_admin", "/admin/consumers"), false);
    assert.equal(canAccessAdminPath("tm_admin", "/admin/dashboard"), false);
  });

  it("can access TM001 fully but not CRM leads", () => {
    assert.equal(canAccessTm001(tm), true);
    assert.equal(canAccessCrmLeads(tm), false);
    assert.equal(canChangeTm001Assignee(tm), true);
    assert.equal(tm001VisibleAssigneeIdsFromStaff(tm, []), "all");
  });
});

describe("tm001 manager/sales scope", () => {
  const staff = [
    { id: "mgr", parent_id: null },
    { id: "s1", parent_id: "mgr" },
    { id: "s2", parent_id: "mgr" },
    { id: "other", parent_id: null },
  ];

  it("limits list and assign targets to self + descendants", () => {
    const manager: SessionUser = {
      rank: "manager",
      userId: "mgr",
      name: "매니저",
      loginId: "m",
      region: null,
      parentId: null,
    };
    const scoped = tm001VisibleAssigneeIdsFromStaff(manager, staff);
    assert.ok(scoped !== "all");
    assert.deepEqual((scoped as string[]).sort(), ["mgr", "s1", "s2"]);
    assert.equal(canAssignTm001To(manager, "s1", scoped), true);
    assert.equal(canAssignTm001To(manager, "other", scoped), false);
    assert.equal(canAssignTm001To(manager, null, scoped), false);
  });

  it("sales can only assign to self", () => {
    const sales: SessionUser = {
      rank: "sales",
      userId: "s1",
      name: "영업",
      loginId: "s",
      region: null,
      parentId: "mgr",
    };
    const scoped = tm001VisibleAssigneeIdsFromStaff(sales, staff);
    assert.deepEqual(scoped, ["s1"]);
    assert.equal(canChangeTm001Assignee(sales), true);
    assert.equal(canAssignTm001To(sales, "s1", scoped), true);
    assert.equal(canAssignTm001To(sales, "s2", scoped), false);
  });
});
