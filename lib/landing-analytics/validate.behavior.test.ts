import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTrackBody } from "@/lib/landing-analytics/validate";

const base = {
  landing_key: "landing_0715s",
  session_id: "11111111-1111-4111-8111-111111111111",
  visitor_id: "22222222-2222-4222-8222-222222222222",
};

describe("landing track validation (behavior)", () => {
  it("accepts scroll_sample with event_key", () => {
    const parsed = parseTrackBody({
      ...base,
      event_type: "scroll_sample",
      event_key: "scroll_sample:40",
      max_depth: 42,
      y_ratio: 0.42,
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.data.visitor_id, base.visitor_id);
      assert.equal(parsed.data.event_key, "scroll_sample:40");
    }
  });

  it("accepts cta_click and lead_submit", () => {
    const cta = parseTrackBody({
      ...base,
      event_type: "cta_click",
      x_ratio: 0.5,
      y_ratio: 0.2,
    });
    assert.equal(cta.ok, true);

    const submit = parseTrackBody({
      ...base,
      event_type: "lead_submit",
    });
    assert.equal(submit.ok, true);
  });

  it("rejects scroll_sample without event_key", () => {
    const parsed = parseTrackBody({
      ...base,
      event_type: "scroll_sample",
      max_depth: 20,
    });
    assert.equal(parsed.ok, false);
  });
});
