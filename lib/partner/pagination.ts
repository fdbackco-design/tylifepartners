import { PARTNER_DEFAULT_LIMIT, PARTNER_MAX_LIMIT } from "@/lib/partner/types";

export function parsePartnerPagination(sp: URLSearchParams): { limit: number; offset: number } {
  const limit = Math.min(Math.max(Number(sp.get("limit") || PARTNER_DEFAULT_LIMIT), 1), PARTNER_MAX_LIMIT);
  const offset = Math.max(Number(sp.get("offset") || 0), 0);
  return { limit, offset };
}
