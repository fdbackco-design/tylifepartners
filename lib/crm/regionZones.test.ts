import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractBaseRegion,
  resolveRegionZone,
  REGION_ZONE_NAMES,
} from "@/lib/crm/regionZones";
import { matchRule, pickWeightedMember, type AssignmentRule } from "@/lib/crm/assignment";

describe("resolveRegionZone", () => {
  it("maps detailed addresses to metro zones", () => {
    assert.equal(resolveRegionZone("인천 영종구"), "수도권");
    assert.equal(resolveRegionZone("인천광역시 중구"), "수도권");
    assert.equal(resolveRegionZone("서울특별시 강남구"), "수도권");
    assert.equal(resolveRegionZone("경기도 성남시"), "수도권");
  });

  it("maps full province names", () => {
    assert.equal(resolveRegionZone("충청남도 천안시"), "충청권");
    assert.equal(resolveRegionZone("경상북도 포항시"), "경상권");
    assert.equal(resolveRegionZone("전라남도 여수시"), "전라권");
    assert.equal(resolveRegionZone("광주광역시"), "전라권");
    assert.equal(resolveRegionZone("강원특별자치도 춘천시"), "강원권");
    assert.equal(resolveRegionZone("제주특별자치도"), "제주권");
  });

  it("returns null when unknown", () => {
    assert.equal(resolveRegionZone(""), null);
    assert.equal(resolveRegionZone(null), null);
    assert.equal(resolveRegionZone("해외거주"), null);
  });

  it("extractBaseRegion returns short names", () => {
    assert.equal(extractBaseRegion("서울특별시 송파구"), "서울");
    assert.equal(extractBaseRegion("부산 해운대구"), "부산");
  });
});

describe("auto-assign helpers", () => {
  it("matchRule finds zone by keywords (legacy)", () => {
    const rules: AssignmentRule[] = [
      {
        id: "1",
        region_group: "수도권",
        region_keywords: ["서울", "인천", "경기"],
        enabled: true,
        members: [],
      },
    ];
    assert.equal(matchRule("인천 영종구", rules)?.region_group, "수도권");
    assert.equal(matchRule("제주", rules), null);
  });

  it("matchRule prefers longer keyword and custom zones", () => {
    const rules: AssignmentRule[] = [
      {
        id: "1",
        region_group: "수도권",
        region_keywords: ["경기"],
        enabled: true,
        members: [],
      },
      {
        id: "2",
        region_group: "해외권",
        region_keywords: ["해외거주"],
        enabled: true,
        members: [],
      },
    ];
    assert.equal(matchRule("해외거주 미국", rules)?.region_group, "해외권");
    assert.equal(matchRule("경기도 성남시", rules)?.region_group, "수도권");
  });

  it("matchRule prefers city-level keywords across rules", () => {
    const rules: AssignmentRule[] = [
      {
        id: "1",
        region_group: "경기 수원",
        region_keywords: ["경기 수원시", "수원시"],
        enabled: true,
        members: [],
      },
      {
        id: "2",
        region_group: "경기 화성",
        region_keywords: ["경기 화성시", "화성시"],
        enabled: true,
        members: [],
      },
      {
        id: "3",
        region_group: "수도권",
        region_keywords: ["경기", "서울", "인천"],
        enabled: true,
        members: [],
      },
    ];
    assert.equal(matchRule("경기 수원시", rules)?.region_group, "경기 수원");
    assert.equal(matchRule("경기 화성시", rules)?.region_group, "경기 화성");
    assert.equal(matchRule("경기 안양시", rules)?.region_group, "수도권");
  });

  it("pickWeightedMember prefers lower assigned_count/weight", () => {
    const picked = pickWeightedMember([
      { id: "a", staff_user_id: "s1", weight: 1, assigned_count: 2 },
      { id: "b", staff_user_id: "s2", weight: 2, assigned_count: 2 },
    ]);
    assert.equal(picked?.staff_user_id, "s2");
  });

  it("filters members by staff region zone", () => {
    const zone = resolveRegionZone("인천광역시 중구");
    assert.equal(zone, "수도권");
    const staffRegion = "수도권";
    const members = [
      { id: "1", staff_user_id: "a", weight: 1, assigned_count: 0 },
      { id: "2", staff_user_id: "b", weight: 1, assigned_count: 0 },
    ];
    const staffById = new Map([
      ["a", { region: "수도권", is_active: true }],
      ["b", { region: "경상권", is_active: true }],
    ]);
    const eligible = members.filter((m) => {
      const s = staffById.get(m.staff_user_id);
      return s?.is_active && s.region === zone;
    });
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0].staff_user_id, "a");
    assert.equal(staffRegion, REGION_ZONE_NAMES[0]);
  });
});
