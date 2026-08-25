import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLikelyMetaObjectId, parseMetaIdsFromBody, parseUTMFromUrl } from "@/lib/utm";

describe("meta attribution from URL", () => {
  it("parses ad_id and numeric utm_content", () => {
    const utm = parseUTMFromUrl(
      "?utm_source=facebook&utm_content=120123456789012345&ad_id=120123456789012345&adset_id=120999888777&campaign_id=120888777666"
    );
    assert.equal(utm.meta_ad_id, "120123456789012345");
    assert.equal(utm.meta_adset_id, "120999888777");
    assert.equal(utm.meta_campaign_id, "120888777666");
  });

  it("infers meta_ad_id from numeric utm_content alone", () => {
    const utm = parseUTMFromUrl("?utm_source=instagram&utm_content=998877665544");
    assert.equal(utm.meta_ad_id, "998877665544");
  });

  it("ignores non-numeric creative labels", () => {
    assert.equal(isLikelyMetaObjectId("summer_banner_v2"), false);
    const utm = parseUTMFromUrl("?utm_content=summer_banner_v2");
    assert.equal(utm.meta_ad_id, undefined);
  });

  it("parses body aliases", () => {
    const ids = parseMetaIdsFromBody({ ad_id: "111222333444", adset_id: "55" }, { utm_content: "x" });
    assert.equal(ids.meta_ad_id, "111222333444");
    assert.equal(ids.meta_adset_id, null);
  });
});
