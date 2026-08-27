import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canViewCalendarEvent,
  normalizeVisibilityForWriter,
  type CalendarEventRow,
} from "@/lib/crm/calendar";
import type { SessionUser } from "@/lib/crm/types";

const staff = [
  { id: "a1", parent_id: null, rank: "admin", is_active: true },
  { id: "m1", parent_id: null, rank: "manager", is_active: true },
  { id: "m2", parent_id: null, rank: "manager", is_active: true },
  { id: "s1", parent_id: "m1", rank: "sales", is_active: true },
  { id: "s2", parent_id: "m1", rank: "sales", is_active: true },
  { id: "s3", parent_id: "m2", rank: "sales", is_active: true },
];

function session(partial: Partial<SessionUser> & Pick<SessionUser, "rank" | "userId">): SessionUser {
  return {
    name: "t",
    loginId: "t",
    region: null,
    parentId: null,
    ...partial,
  };
}

function baseEv(over: Partial<CalendarEventRow> = {}): CalendarEventRow {
  return {
    id: "e1",
    title: "t",
    body: "",
    event_date: "2026-08-01",
    event_type: "general",
    all_day: true,
    start_at: null,
    end_at: null,
    visibility: "all",
    viewer_ids: [],
    created_by: "a1",
    created_by_rank: "admin",
    team_root_id: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

describe("calendar visibility", () => {
  it("admin all-visibility visible to everyone", () => {
    const ev = baseEv({ visibility: "all" });
    assert.equal(canViewCalendarEvent(session({ rank: "admin", userId: "a1" }), ev, staff), true);
    assert.equal(canViewCalendarEvent(session({ rank: "manager", userId: "m1" }), ev, staff), true);
    assert.equal(canViewCalendarEvent(session({ rank: "sales", userId: "s1" }), ev, staff), true);
  });

  it("admin_plus only for admin", () => {
    const ev = baseEv({ visibility: "admin_plus" });
    assert.equal(canViewCalendarEvent(session({ rank: "admin", userId: "a1" }), ev, staff), true);
    assert.equal(canViewCalendarEvent(session({ rank: "manager", userId: "m1" }), ev, staff), false);
    assert.equal(canViewCalendarEvent(session({ rank: "sales", userId: "s1" }), ev, staff), false);
  });

  it("manager events are hidden from admin", () => {
    const ev = baseEv({
      created_by: "m1",
      created_by_rank: "manager",
      team_root_id: "m1",
      visibility: "all",
    });
    assert.equal(canViewCalendarEvent(session({ rank: "admin", userId: "a1" }), ev, staff), false);
    assert.equal(canViewCalendarEvent(session({ rank: "manager", userId: "m1" }), ev, staff), true);
    assert.equal(canViewCalendarEvent(session({ rank: "sales", userId: "s1" }), ev, staff), true);
    assert.equal(canViewCalendarEvent(session({ rank: "sales", userId: "s3" }), ev, staff), false);
  });

  it("manager specific sales only", () => {
    const ev = baseEv({
      created_by: "m1",
      created_by_rank: "manager",
      team_root_id: "m1",
      visibility: "sales",
      viewer_ids: ["s1"],
    });
    assert.equal(canViewCalendarEvent(session({ rank: "sales", userId: "s1" }), ev, staff), true);
    assert.equal(canViewCalendarEvent(session({ rank: "sales", userId: "s2" }), ev, staff), false);
  });

  it("normalizeVisibility rejects manager admin_plus", () => {
    const r = normalizeVisibilityForWriter(
      session({ rank: "manager", userId: "m1" }),
      "admin_plus",
      [],
      staff
    );
    assert.equal(r.ok, false);
  });

  it("normalizeVisibility manager sales must be in team", () => {
    const bad = normalizeVisibilityForWriter(
      session({ rank: "manager", userId: "m1" }),
      "sales",
      ["s3"],
      staff
    );
    assert.equal(bad.ok, false);
    const good = normalizeVisibilityForWriter(
      session({ rank: "manager", userId: "m1" }),
      "sales",
      ["s1"],
      staff
    );
    assert.equal(good.ok, true);
    if (good.ok) {
      assert.deepEqual(good.viewer_ids, ["s1"]);
      assert.equal(good.team_root_id, "m1");
    }
  });
});
