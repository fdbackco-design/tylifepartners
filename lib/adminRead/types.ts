export type AdminReadResource = "candidates" | "tm001" | "tm002" | "calendar";

export type AdminReadPermissions = {
  key_id: string;
  label: string;
  rate_limit_per_minute: number;
  expires_at: string;
  allow_candidates: boolean;
  allow_tm001: boolean;
  allow_tm002: boolean;
  allow_calendar: boolean;
};

export type AdminReadAuthContext = {
  keyId: string;
  label: string;
  rateLimitPerMinute: number;
  permissions: AdminReadPermissions;
};

export const ADMIN_READ_DEFAULT_LIMIT = 50;
export const ADMIN_READ_MAX_LIMIT = 500;
