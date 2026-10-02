import { parseLeadQuery, queryLeads } from "@/lib/crm/queryLeads";
import { canSeeAdminStatus } from "@/lib/crm/scope";
import { ADMIN_READ_SESSION } from "@/lib/adminRead/session";

export async function queryAdminReadCandidates(sp: URLSearchParams) {
  const forced = new URLSearchParams(sp);
  forced.set("category", "candidates");
  const q = parseLeadQuery(forced);
  const { items, total } = await queryLeads(ADMIN_READ_SESSION, q);
  const showAdmin = canSeeAdminStatus(ADMIN_READ_SESSION);
  const mapped = showAdmin ? items : items.map((row) => ({ ...row, admin_status: null }));
  return { items: mapped, total: total ?? mapped.length };
}
