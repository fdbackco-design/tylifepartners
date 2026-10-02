import { startOfKstDayIso, startOfNextKstDayIso } from "@/lib/crm/kst";
import { TM002_PARTNER_CODE } from "@/lib/crm/tm002/types";
import type { PartnerApiPermissions, PartnerPublicTm002Customer } from "@/lib/partner/types";
import { getSupabaseAdmin } from "@/lib/supabase";

const SELECT = "id, batch_code, status, level, flag, updated_at";

function mapRow(row: Record<string, unknown>): PartnerPublicTm002Customer {
  return {
    id: String(row.id),
    batch_code: String(row.batch_code ?? ""),
    status: String(row.status ?? ""),
    level: String(row.level ?? ""),
    flag: String(row.flag ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export async function queryPartnerTm002Customers(
  permissions: PartnerApiPermissions,
  sp: URLSearchParams,
  limit: number,
  offset: number
): Promise<{ items: PartnerPublicTm002Customer[]; total: number }> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("tm002_customers")
    .select(SELECT, { count: "exact" })
    .eq("partner_code", TM002_PARTNER_CODE)
    .in("batch_code", permissions.tm002_batch_codes)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true });

  const status = sp.get("status")?.trim();
  if (status) query = query.eq("status", status);

  const assignedDate = sp.get("assigned_date")?.trim();
  if (assignedDate) {
    query = query
      .gte("assigned_at", startOfKstDayIso(assignedDate))
      .lt("assigned_at", startOfNextKstDayIso(assignedDate));
  }

  const batchReq = String(sp.get("batch_code") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (batchReq.length) {
    const allowed = batchReq.filter((b) => permissions.tm002_batch_codes.includes(b));
    if (!allowed.length) return { items: [], total: 0 };
    query = query.in("batch_code", allowed);
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);

  return {
    items: (data ?? []).map((r) => mapRow(r as Record<string, unknown>)),
    total: count ?? 0,
  };
}
