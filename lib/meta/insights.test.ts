import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addCalendarDaysYmd,
  buildTodayDbCost,
  computeCostPerDb,
  extractLeadCountFromActions,
  formatDbCostWon,
  isDaangnUtmSource,
  yesterdayMetricsDateKst,
  ymdInTimeZone,
} from "@/lib/meta/insights";

describe("extractLeadCountFromActions", () => {
  it("prefers lead over other action types", () => {
    assert.equal(
      extractLeadCountFromActions([
        { action_type: "link_click", value: "100" },
        { action_type: "lead", value: "7" },
        { action_type: "onsite_conversion.lead_grouped", value: "9" },
      ]),
      7
    );
  });

  it("returns 0 for empty/invalid", () => {
    assert.equal(extractLeadCountFromActions(null), 0);
    assert.equal(extractLeadCountFromActions([]), 0);
  });
});

describe("computeCostPerDb", () => {
  it("divides yesterday spend by yesterday DB inflows", () => {
    assert.equal(computeCostPerDb(10000, 4), 2500);
  });

  it("returns null when inflows are zero", () => {
    assert.equal(computeCostPerDb(10000, 0), null);
  });
});

describe("isDaangnUtmSource", () => {
  it("matches daangn case-insensitively", () => {
    assert.equal(isDaangnUtmSource("daangn"), true);
    assert.equal(isDaangnUtmSource("DAANGN"), true);
    assert.equal(isDaangnUtmSource("facebook"), false);
    assert.equal(isDaangnUtmSource(null), false);
  });
});

describe("yesterdayMetricsDateKst", () => {
  it("returns the previous KST calendar day", () => {
    const ymd = yesterdayMetricsDateKst(new Date("2026-08-27T12:00:00+09:00"));
    assert.equal(ymd, "2026-08-26");
  });
});

describe("buildTodayDbCost", () => {
  it("shows 집계 중 when insights missing", () => {
    const cost = buildTodayDbCost({
      metricsDate: "2026-08-26",
      spend: null,
      dbInflowCount: null,
      syncedAt: null,
      hasInsightRows: false,
    });
    assert.equal(cost.status, "pending");
    assert.equal(cost.label, "집계 중");
  });

  it("shows ready cost from yesterday metrics", () => {
    const cost = buildTodayDbCost({
      metricsDate: "2026-08-26",
      spend: 10000,
      dbInflowCount: 4,
      syncedAt: new Date().toISOString(),
      syncStatus: "ok",
      hasInsightRows: true,
    });
    assert.equal(cost.status, "ready");
    assert.equal(cost.label, formatDbCostWon(2500));
    assert.equal(cost.amount, 2500);
  });

  it("does not show 0원 when inflow is 0 — 데이터 없음", () => {
    const cost = buildTodayDbCost({
      metricsDate: "2026-08-26",
      spend: 5000,
      dbInflowCount: 0,
      syncedAt: new Date().toISOString(),
      syncStatus: "ok",
      hasInsightRows: true,
    });
    assert.equal(cost.status, "unavailable");
    assert.equal(cost.label, "데이터 없음");
    assert.notEqual(cost.label, "0원");
  });
});

describe("addCalendarDaysYmd", () => {
  it("moves back one day", () => {
    assert.equal(addCalendarDaysYmd("2026-08-27", -1), "2026-08-26");
  });
});

describe("ymdInTimeZone", () => {
  it("formats a stable YMD in Asia/Seoul", () => {
    const ymd = ymdInTimeZone(new Date("2026-08-27T01:00:00Z"), "Asia/Seoul");
    assert.match(ymd, /^\d{4}-\d{2}-\d{2}$/);
  });
});
