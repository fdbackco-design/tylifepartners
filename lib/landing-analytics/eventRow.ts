/** DB/API에서 조회한 최소 이벤트 필드 (집계용) */
export type LandingEventAggregateRow = {
  session_id: string;
  event_type: string;
  depth?: number | null;
  max_depth?: number | null;
  duration_seconds?: number | null;
  section_name?: string | null;
  section_label?: string | null;
  y_ratio?: number | null;
  device_type?: string | null;
  viewport_width?: number | null;
  user_agent?: string | null;
  landing_key?: string | null;
  visitor_id?: string | null;
  created_at?: string | null;
};
