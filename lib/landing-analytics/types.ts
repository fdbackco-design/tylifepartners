import type { LandingKey } from "@/lib/landing-analytics/sections";

export const LANDING_EVENT_TYPES = [
  "page_view",
  "scroll_depth",
  "scroll_sample",
  "click",
  "cta_click",
  "heartbeat",
  "leave",
  "section_dwell",
  "lead_submit",
] as const;

export type LandingEventType = (typeof LANDING_EVENT_TYPES)[number];

export const SCROLL_DEPTH_MILESTONES = [25, 50, 75, 100] as const;

export type ScrollDepthMilestone = (typeof SCROLL_DEPTH_MILESTONES)[number];

export type DeviceType = "mobile" | "tablet" | "desktop";

export type LandingTrackPayload = {
  landing_key: LandingKey | string;
  session_id: string;
  visitor_id?: string;
  event_type: LandingEventType;
  /** 서버 중복 방지용 (예: scroll_sample:40) */
  event_key?: string;
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
  lead_table?: string | null;
  lead_id?: string | null;
};
