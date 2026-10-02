export type PartnerResource = "candidates" | "tm001" | "tm002" | "calendar";

export type PartnerApiPermissions = {
  key_id: string;
  client_id: string;
  client_name: string;
  label: string;
  rate_limit_per_minute: number;
  allow_candidates: boolean;
  allow_tm001: boolean;
  allow_tm002: boolean;
  allow_calendar: boolean;
  candidate_utm_sources: string[];
  candidate_entry_pages: string[];
  candidate_regions: string[];
  tm001_batch_codes: string[];
  tm002_batch_codes: string[];
  calendar_event_types: string[];
};

export type PartnerAuthContext = {
  keyId: string;
  clientId: string;
  clientName: string;
  label: string;
  rateLimitPerMinute: number;
  permissions: PartnerApiPermissions;
};

export type PartnerErrorCode =
  | "unauthorized"
  | "forbidden"
  | "invalid_query"
  | "rate_limited"
  | "scope_not_configured"
  | "internal_error";

export type PartnerPublicCandidate = {
  id: string;
  status: string;
  created_at: string;
  region: string;
  job: string;
  job_rank: string;
  age_group: string;
  entry_page: string;
  utm_source: string;
};

export type PartnerPublicTm001Customer = {
  id: string;
  batch_code: string;
  status: string;
  product: string | null;
  updated_at: string;
};

export type PartnerPublicTm002Customer = {
  id: string;
  batch_code: string;
  status: string;
  level: string;
  flag: string;
  updated_at: string;
};

export type PartnerPublicCalendarEvent = {
  id: string;
  event_date: string;
  event_type: string;
  all_day: boolean;
  start_at: string | null;
  end_at: string | null;
  title: string;
};

export const PARTNER_DEFAULT_LIMIT = 50;
export const PARTNER_MAX_LIMIT = 200;

export const PARTNER_CALENDAR_TYPES_DEFAULT = [
  "general",
  "lecture",
  "important",
  "deadline",
  "holiday",
] as const;
