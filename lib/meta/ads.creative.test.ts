import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractCreativeMedia } from "@/lib/meta/ads";

describe("extractCreativeMedia", () => {
  it("reads lead-ad nested link_data picture/hash", () => {
    const media = extractCreativeMedia({
      thumbnail_url: null,
      image_url: null,
      object_story_spec: {
        link_data: {
          image_hash: "abc123",
          picture: "https://cdn.example/pic.jpg",
        },
      },
    });
    assert.equal(media.image_url, "https://cdn.example/pic.jpg");
    assert.equal(media.image_hash, "abc123");
  });

  it("falls back to asset_feed_spec images", () => {
    const media = extractCreativeMedia({
      asset_feed_spec: {
        images: [{ hash: "h1", url: "https://cdn.example/feed.jpg" }],
      },
    });
    assert.equal(media.image_url, "https://cdn.example/feed.jpg");
    assert.equal(media.image_hash, "h1");
  });
});
