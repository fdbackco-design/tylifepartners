import type { LandingKey } from "@/lib/landing-analytics/sections";

export const LANDING_EVENT_TYPES = [
  "page_view",
  "scroll_depth",
  "click",
  "heartbeat",
  "leave",
] as const;

export type LandingEventType = (typeof LANDING_EVENT_TYPES)[number];

export const SCROLL_DEPTH_MILESTONES = [25, 50, 75, 100] as const;

export type ScrollDepthMilestone = (typeof SCROLL_DEPTH_MILESTONES)[number];

export type DeviceType = "mobile" | "tablet" | "desktop";

export type LandingTrackPayload = {
  landing_key: LandingKey;
  session_id: string;
  event_type: LandingEventType;
  page_url?: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  section_name?: string;
  section_label?: string;
  depth?: number;
  max_depth?: number;
  duration_seconds?: number;
  x_ratio?: number;
  y_ratio?: number;
  viewport_width?: number;
  viewport_height?: number;
  document_height?: number;
  device_type?: DeviceType;
  user_agent?: string;
};

export type LandingEventRow = LandingTrackPayload & {
  id: string;
  created_at: string;
};
