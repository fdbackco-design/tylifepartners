import type { LeadCategory, SessionUser } from "@/lib/crm/types";
import { visibleAssigneeIds } from "@/lib/crm/scope";
import { tableForCategory } from "@/lib/crm/status";
import { getOrLoadTtlCache, invalidateTtlCache } from "@/lib/crm/ttlCache";
import { getSupabaseAdmin } from "@/lib/supabase";

export type HiddenLeadMaps = {
  leads: Set<string>;
  tylife_b2b: Set<string>;
};

const HIDDEN_LEADS_CACHE_KEY = "crm:hidden-lead-ids";
const HIDDEN_LEADS_TTL_MS = 30_000;

async function loadHiddenLeadIdMapsUncached(): Promise<HiddenLeadMaps> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("lead_list_hides").select("lead_table, lead_id");
  if (error) {
    if (/lead_list_hides|schema cache/i.test(error.message)) {
      return { leads: new Set(), tylife_b2b: new Set() };
    }
    console.warn("[leadListHide] load:", error.message);
    return { leads: new Set(), tylife_b2b: new Set() };
  }
  const leads = new Set<string>();
  const tylife_b2b = new Set<string>();
  for (const row of data ?? []) {
    const id = String(row.lead_id ?? "");
    if (!id) continue;
    if (row.lead_table === "tylife_b2b") tylife_b2b.add(id);
    else leads.add(id);
  }
  return { leads, tylife_b2b };
}

export async function loadHiddenLeadIdMaps(): Promise<HiddenLeadMaps> {
  return getOrLoadTtlCache(HIDDEN_LEADS_CACHE_KEY, HIDDEN_LEADS_TTL_MS, loadHiddenLeadIdMapsUncached);
}

export function invalidateHiddenLeadIdMapsCache(): void {
  invalidateTtlCache(HIDDEN_LEADS_CACHE_KEY);
}

export function applyHiddenLeadFilter(
  query: { not: (col: string, op: string, val: string) => unknown },
  table: "leads" | "tylife_b2b",
  hidden: HiddenLeadMaps
) {
  const ids = table === "tylife_b2b" ? hidden.tylife_b2b : hidden.leads;
  if (!ids.size) return query;
  const list = Array.from(ids).join(",");
  return query.not("id", "in", `(${list})`);
}

export type HideLeadItem = { id: string; category: LeadCategory };

export type HideLeadsResult =
  | {
      ok: true;
      hidden: number;
      skipped: number;
      hiddenDetails: { id: string; category: LeadCategory; name: string; phone: string }[];
    }
  | { ok: false; message: string; status: number };

export async function hideLeadsFromList(session: SessionUser, items: HideLeadItem[]): Promise<HideLeadsResult> {
  if (session.rank !== "admin") {
    return { ok: false, message: "관리자만 삭제할 수 있습니다.", status: 403 };
  }
  if (!items.length) {
    return { ok: false, message: "선택된 항목이 없습니다.", status: 400 };
  }
  if (items.length > 200) {
    return { ok: false, message: "한 번에 200건까지 삭제할 수 있습니다.", status: 400 };
  }

  const supabase = getSupabaseAdmin();
  const scoped = await visibleAssigneeIds(session);
  const now = new Date().toISOString();
  let hidden = 0;
  let skipped = 0;
  const hiddenDetails: { id: string; category: LeadCategory; name: string; phone: string }[] = [];

  for (const item of items) {
    const table = tableForCategory(item.category);
    const { data: lead, error } = await supabase
      .from(table)
      .select("id, name, phone, assignee_id, merge_status")
      .eq("id", item.id)
      .maybeSingle();

    if (error || !lead) {
      skipped += 1;
      continue;
    }
    if ((lead as { merge_status?: string }).merge_status === "merged") {
      skipped += 1;
      continue;
    }

    const assigneeId = (lead as { assignee_id?: string | null }).assignee_id ?? null;
    if (scoped !== "all" && (!assigneeId || !scoped.includes(assigneeId))) {
      skipped += 1;
      continue;
    }

    const { error: insErr } = await supabase.from("lead_list_hides").upsert(
      {
        lead_table: table,
        lead_id: item.id,
        hidden_at: now,
        hidden_by_user_id: session.userId,
        hidden_by_login_id: session.loginId,
        hidden_by_name: session.name,
        hidden_by_rank: session.rank,
      },
      { onConflict: "lead_table,lead_id" }
    );

    if (insErr) {
      if (/lead_list_hides|schema cache/i.test(insErr.message)) {
        return {
          ok: false,
          message: "숨김 테이블이 없습니다. 마이그레이션 030을 적용해 주세요.",
          status: 500,
        };
      }
      skipped += 1;
      continue;
    }

    hidden += 1;
    hiddenDetails.push({
      id: item.id,
      category: item.category,
      name: String((lead as { name?: string }).name ?? ""),
      phone: String((lead as { phone?: string }).phone ?? ""),
    });
  }

  if (!hidden && skipped) {
    return { ok: false, message: "삭제할 수 있는 항목이 없습니다.", status: 400 };
  }

  if (hidden) invalidateHiddenLeadIdMapsCache();
  return { ok: true, hidden, skipped, hiddenDetails };
}
