import { LANDING_KEYS } from "@/lib/landing-analytics/sections";
import {
  LANDING_EVENT_TYPES,
  SCROLL_DEPTH_MILESTONES,
  type DeviceType,
  type LandingEventType,
  type LandingTrackPayload,
} from "@/lib/landing-analytics/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_KEYS = new Set<string>([
  "landing_key",
  "session_id",
  "event_type",
  "page_url",
  "referrer",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "section_name",
  "section_label",
  "depth",
  "max_depth",
  "duration_seconds",
  "x_ratio",
  "y_ratio",
  "viewport_width",
  "viewport_height",
  "document_height",
  "device_type",
  "user_agent",
]);

function clampStr(value: unknown, max: number): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string") return undefined;
  return value.slice(0, max);
}

function clampNum(value: unknown, min: number, max: number): number | undefined {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}

function clampRatio(value: unknown): number | undefined {
  return clampNum(value, 0, 1);
}

export function parseTrackBody(raw: unknown): { ok: true; data: LandingTrackPayload } | { ok: false; message: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, message: "Invalid body" };
  }

  const body = raw as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!ALLOWED_KEYS.has(key)) {
      return { ok: false, message: `Disallowed field: ${key}` };
    }
  }

  const landing_key = body.landing_key;
  if (typeof landing_key !== "string" || !LANDING_KEYS.includes(landing_key as (typeof LANDING_KEYS)[number])) {
    return { ok: false, message: "Invalid landing_key" };
  }

  const session_id = body.session_id;
  if (typeof session_id !== "string" || !UUID_RE.test(session_id)) {
    return { ok: false, message: "Invalid session_id" };
  }

  const event_type = body.event_type;
  if (typeof event_type !== "string" || !LANDING_EVENT_TYPES.includes(event_type as LandingEventType)) {
    return { ok: false, message: "Invalid event_type" };
  }

  const depth = clampNum(body.depth, 0, 100);
  const max_depth = clampNum(body.max_depth, 0, 100);
  const duration_seconds = clampNum(body.duration_seconds, 0, 86400);

  if (event_type === "scroll_depth") {
    if (depth == null || !SCROLL_DEPTH_MILESTONES.includes(depth as (typeof SCROLL_DEPTH_MILESTONES)[number])) {
      return { ok: false, message: "scroll_depth requires depth 25|50|75|100" };
    }
  }

  if (event_type === "leave") {
    if (max_depth == null) {
      return { ok: false, message: "leave requires max_depth" };
    }
    if (duration_seconds == null) {
      return { ok: false, message: "leave requires duration_seconds" };
    }
  }

  if (event_type === "click") {
    if (clampRatio(body.x_ratio) == null || clampRatio(body.y_ratio) == null) {
      return { ok: false, message: "click requires x_ratio and y_ratio" };
    }
  }

  if (event_type === "section_dwell") {
    if (!clampStr(body.section_name, 80)) {
      return { ok: false, message: "section_dwell requires section_name" };
    }
    if (!clampStr(body.section_label, 120)) {
      return { ok: false, message: "section_dwell requires section_label" };
    }
    if (duration_seconds == null || duration_seconds < 1) {
      return { ok: false, message: "section_dwell requires duration_seconds >= 1" };
    }
  }

  const device_type = body.device_type;
  if (
    device_type != null &&
    device_type !== "" &&
    !["mobile", "tablet", "desktop"].includes(String(device_type))
  ) {
    return { ok: false, message: "Invalid device_type" };
  }

  const data: LandingTrackPayload = {
    landing_key: landing_key as LandingTrackPayload["landing_key"],
    session_id,
    event_type: event_type as LandingEventType,
    page_url: clampStr(body.page_url, 500),
    referrer: clampStr(body.referrer, 500),
    utm_source: clampStr(body.utm_source, 120),
    utm_medium: clampStr(body.utm_medium, 120),
    utm_campaign: clampStr(body.utm_campaign, 120),
    utm_content: clampStr(body.utm_content, 120),
    utm_term: clampStr(body.utm_term, 120),
    section_name: clampStr(body.section_name, 80),
    section_label: clampStr(body.section_label, 120),
    depth,
    max_depth,
    duration_seconds,
    x_ratio: clampRatio(body.x_ratio),
    y_ratio: clampRatio(body.y_ratio),
    viewport_width: clampNum(body.viewport_width, 0, 10000),
    viewport_height: clampNum(body.viewport_height, 0, 10000),
    document_height: clampNum(body.document_height, 0, 1000000),
    device_type: (device_type as DeviceType) || undefined,
    user_agent: clampStr(body.user_agent, 300),
  };

  return { ok: true, data };
}

export function toDbRow(data: LandingTrackPayload) {
  return {
    landing_key: data.landing_key,
    session_id: data.session_id,
    event_type: data.event_type,
    page_url: data.page_url ?? null,
    referrer: data.referrer ?? null,
    utm_source: data.utm_source ?? null,
    utm_medium: data.utm_medium ?? null,
    utm_campaign: data.utm_campaign ?? null,
    utm_content: data.utm_content ?? null,
    utm_term: data.utm_term ?? null,
    section_name: data.section_name ?? null,
    section_label: data.section_label ?? null,
    depth: data.depth ?? null,
    max_depth: data.max_depth ?? null,
    duration_seconds: data.duration_seconds ?? null,
    x_ratio: data.x_ratio ?? null,
    y_ratio: data.y_ratio ?? null,
    viewport_width: data.viewport_width ?? null,
    viewport_height: data.viewport_height ?? null,
    document_height: data.document_height ?? null,
    device_type: data.device_type ?? null,
    user_agent: data.user_agent ?? null,
  };
}
