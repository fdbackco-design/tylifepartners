import { ADMIN_READ_DEFAULT_LIMIT, ADMIN_READ_MAX_LIMIT } from "@/lib/adminRead/types";

export function parseAdminReadPagination(sp: URLSearchParams): { limit: number; offset: number } {
  const limit = Math.min(Math.max(Number(sp.get("limit") || ADMIN_READ_DEFAULT_LIMIT), 1), ADMIN_READ_MAX_LIMIT);
  const offset = Math.max(Number(sp.get("offset") || 0), 0);
  return { limit, offset };
}
