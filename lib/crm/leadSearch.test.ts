import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLeadSearchOrFilter } from "@/lib/crm/leadSearch";

describe("buildLeadSearchOrFilter", () => {
  it("searches hyphenated phone against digit-only storage", () => {
    assert.equal(
      buildLeadSearchOrFilter("010-1233-1234"),
      [
        "name.ilike.%010-1233-1234%",
        "phone.ilike.%010-1233-1234%",
        "phone.ilike.%01012331234%",
        "normalized_phone.ilike.%01012331234%",
      ].join(",")
    );
  });

  it("keeps name search without forcing digit phone clauses", () => {
    assert.equal(
      buildLeadSearchOrFilter("김철수"),
      "name.ilike.%김철수%,phone.ilike.%김철수%"
    );
  });

  it("adds normalized_phone for digit-only queries", () => {
    assert.equal(
      buildLeadSearchOrFilter("01012331234"),
      [
        "name.ilike.%01012331234%",
        "phone.ilike.%01012331234%",
        "normalized_phone.ilike.%01012331234%",
      ].join(",")
    );
  });
});
