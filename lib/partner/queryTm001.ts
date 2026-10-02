import { startOfKstDayIso, startOfNextKstDayIso } from "@/lib/crm/kst";
import { TM001_PARTNER_CODE } from "@/lib/crm/tm001/types";
import type { PartnerApiPermissions, PartnerPublicTm001Customer } from "@/lib/partner/types";
import { getSupabaseAdmin } from "@/lib/supabase";

const SELECT = "id, batch_code, status, product, updated_at";

function mapRow(row: Record<string, unknown>): PartnerPublicTm001Customer {
  return {
    id: String(row.id),
    batch_code: String(row.batch_code ?? ""),
    status: String(row.status ?? ""),
    product: row.product != null ? String(row.product) : null,
    updated_at: String(row.updated_at ?? ""),
  };
}

export async function queryPartnerTm001Customers(
  permissions: PartnerApiPermissions,
  sp: URLSearchParams,
  limit: number,
  offset: number
): Promise<{ items: PartnerPublicTm001Customer[]; total: number }> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("tm001_customers")
    .select(SELECT, { count: "exact" })
    .eq("partner_code", TM001_PARTNER_CODE)
    .in("batch_code", permissions.tm001_batch_codes)
    .order("updated_at", { ascending: false });

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
    const allowed = batchReq.filter((b) => permissions.tm001_batch_codes.includes(b));
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
