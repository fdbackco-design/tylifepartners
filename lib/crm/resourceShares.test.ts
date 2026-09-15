import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isResourcePostNew,
  normalizeProductTags,
  normalizeSituationTags,
  normalizeStatusTags,
  resourceBodyPreview,
} from "@/lib/crm/resourceShares";

describe("resourceShares tags", () => {
  it("keeps only allowed product tags and dedupes", () => {
    assert.deepEqual(normalizeProductTags(["크루즈", "크루즈", "없는태그", "가전"]), ["크루즈", "가전"]);
    assert.deepEqual(normalizeProductTags(null), []);
    assert.deepEqual(normalizeProductTags(undefined), []);
  });

  it("keeps only allowed status tags", () => {
    assert.deepEqual(normalizeStatusTags(["판매 가능", "판매 가능", "해킹"]), ["판매 가능"]);
    assert.deepEqual(normalizeStatusTags(["일시 품절", "신규 제품", "프로모션 진행 중"]), [
      "일시 품절",
      "신규 제품",
      "프로모션 진행 중",
    ]);
  });

  it("keeps only allowed situation tags", () => {
    assert.deepEqual(normalizeSituationTags(["가격으로 접근할 때", "hack"]), ["가격으로 접근할 때"]);
  });

  it("treats empty tags as compatible with legacy posts", () => {
    assert.deepEqual(normalizeProductTags([]), []);
    assert.deepEqual(normalizeStatusTags([]), []);
    assert.deepEqual(normalizeSituationTags([]), []);
  });
});

describe("resourceShares helpers", () => {
  it("marks posts within 7 days as NEW", () => {
    const now = new Date("2026-09-15T12:00:00+09:00");
    assert.equal(isResourcePostNew("2026-09-14T01:00:00.000Z", now), true);
    assert.equal(isResourcePostNew("2026-08-01T01:00:00.000Z", now), false);
  });

  it("builds one-line preview", () => {
    assert.equal(resourceBodyPreview("짧은 설명"), "짧은 설명");
    assert.equal(resourceBodyPreview("줄1\n줄2"), "줄1 줄2");
    const long = "가".repeat(80);
    assert.equal(resourceBodyPreview(long, 72).endsWith("…"), true);
  });
});
