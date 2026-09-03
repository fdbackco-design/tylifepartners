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

  it("reads carousel child_attachments image_hash", () => {
    const media = extractCreativeMedia({
      thumbnail_url: "https://cdn.example/thumb.jpg",
      object_type: "SHARE",
      object_story_spec: {
        link_data: {
          child_attachments: [
            { image_hash: "carousel_hash_1", name: "카드1" },
            { image_hash: "carousel_hash_2", name: "카드2" },
          ],
        },
      },
    });
    assert.equal(media.thumbnail_url, "https://cdn.example/thumb.jpg");
    assert.equal(media.image_hash, "carousel_hash_1");
  });
});
