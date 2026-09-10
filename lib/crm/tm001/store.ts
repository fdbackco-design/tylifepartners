import type { Tm001ExcelStayRow } from "@/lib/crm/tm001/excel";
import {
  TM001_PARTNER_CODE,
  TM001_PARTNER_NAME,
  formatBatchCode,
  formatMergedCustomerName,
  isTm001Product,
  isTm001Status,
  type Tm001Comment,
  type Tm001Customer,
  type Tm001Stay,
  type Tm001Status,
} from "@/lib/crm/tm001/types";
import { buildAssigneeNameChain } from "@/lib/crm/assigneeHistoryFormat";
import { appendStatusMemo } from "@/lib/crm/memo";
import { canAssignTm001To, canChangeTm001Assignee, tm001VisibleAssigneeIds } from "@/lib/crm/scope";
import type { SessionUser } from "@/lib/crm/types";
import { getSupabaseAdmin } from "@/lib/supabase";

type StaffLite = { id: string; name: string };

function mapStay(row: Record<string, unknown>): Tm001Stay {
  return {
    id: String(row.id),
    customer_id: String(row.customer_id),
    batch_id: row.batch_id ? String(row.batch_id) : null,
    hotel_name: String(row.hotel_name ?? ""),
    region: String(row.region ?? ""),
    detail: String(row.detail ?? ""),
    stay_type: String(row.stay_type ?? ""),
    room: String(row.room ?? ""),
    raw_room: String(row.raw_room ?? ""),
    raw_room_type: String(row.raw_room_type ?? ""),
    url: String(row.url ?? ""),
    site_name: String(row.site_name ?? ""),
    confidence: String(row.confidence ?? ""),
    needs_review: Boolean(row.needs_review),
    sort_order: Number(row.sort_order ?? 0),
    created_at: String(row.created_at ?? ""),
  };
}

function mapComments(raw: unknown): Tm001Comment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => {
      if (!c || typeof c !== "object") return null;
      const o = c as Record<string, unknown>;
      const text = String(o.text ?? "").trim();
      if (!text) return null;
      return {
        id: String(o.id ?? crypto.randomUUID()),
        text,
        at: String(o.at ?? new Date().toISOString()),
        by: o.by != null ? String(o.by) : undefined,
      };
    })
    .filter(Boolean) as Tm001Comment[];
}

export async function nextTm001BatchCode(partnerCode = TM001_PARTNER_CODE): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tm001_batches")
    .select("batch_code")
    .eq("partner_code", partnerCode)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  let max = 0;
  for (const r of data ?? []) {
    const n = Number(String(r.batch_code).replace(/\D/g, ""));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return formatBatchCode(max + 1);
}

function mapCustomerRow(
  r: Record<string, unknown>,
  stays: Tm001Stay[],
  staffById: Map<string, StaffLite>
): Tm001Customer {
  const status = isTm001Status(r.status) ? r.status : "미접촉";
  return {
    id: String(r.id),
    partner_code: String(r.partner_code ?? TM001_PARTNER_CODE),
    partner_name: String(r.partner_name ?? TM001_PARTNER_NAME),
    batch_code: String(r.batch_code ?? "001"),
    name: String(r.name ?? ""),
    phone: String(r.phone ?? ""),
    normalized_phone: String(r.normalized_phone ?? ""),
    raw_phone: r.raw_phone != null ? String(r.raw_phone) : null,
    visit_count: Number(r.visit_count ?? 0),
    assignee_id: r.assignee_id ? String(r.assignee_id) : null,
    assignee_name: r.assignee_id ? staffById.get(String(r.assignee_id))?.name ?? null : null,
    assigned_at: r.assigned_at ? String(r.assigned_at) : null,
    status,
    product: r.product != null ? String(r.product) : null,
    memo: String(r.memo ?? ""),
    comments: mapComments(r.comments),
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
    stays,
  };
}

export async function getTm001CustomerById(
  id: string,
  opts?: { includeStays?: boolean; includeHistory?: boolean }
): Promise<Tm001Customer | null> {
  const supabase = getSupabaseAdmin();
  const { data: row, error } = await supabase.from("tm001_customers").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;

  let stays: Tm001Stay[] = [];
  if (opts?.includeStays !== false) {
    const { data: stayRows, error: stayErr } = await supabase
      .from("tm001_stays")
      .select("*")
      .eq("customer_id", id)
      .order("sort_order", { ascending: true });
    if (stayErr) throw new Error(stayErr.message);
    stays = (stayRows ?? []).map((s) => mapStay(s as Record<string, unknown>));
  }

  const staffById = new Map<string, StaffLite>();
  if (row.assignee_id) {
    const { data: staff } = await supabase
      .from("staff_users")
      .select("id, name")
      .eq("id", String(row.assignee_id))
      .maybeSingle();
    if (staff) staffById.set(String(staff.id), { id: String(staff.id), name: String(staff.name) });
  }

  const item = mapCustomerRow(row as Record<string, unknown>, stays, staffById);
  if (opts?.includeHistory) {
    const [withHist] = await attachTm001AssigneeHistories([item], staffById);
    return withHist ?? item;
  }
  return item;
}

async function attachTm001AssigneeHistories(
  items: Tm001Customer[],
  staffById?: Map<string, StaffLite>
): Promise<Tm001Customer[]> {
  if (!items.length) return items;
  const supabase = getSupabaseAdmin();
  const ids = items.map((i) => i.id);
  const logs: Array<{
    customer_id: string;
    from_assignee_id: string | null;
    to_assignee_id: string | null;
    assigned_at: string;
  }> = [];
  const IN_CHUNK = 100;
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const { data, error } = await supabase
      .from("tm001_assignment_logs")
      .select("customer_id, from_assignee_id, to_assignee_id, assigned_at")
      .in("customer_id", chunk)
      .order("assigned_at", { ascending: true });
    if (error) {
      // 마이그레이션 전이면 이력 없이 목록만
      if (/tm001_assignment_logs|schema cache|does not exist/i.test(error.message)) break;
      console.error("attachTm001AssigneeHistories:", error.message);
      break;
    }
    for (const row of data ?? []) {
      logs.push({
        customer_id: String(row.customer_id),
        from_assignee_id: row.from_assignee_id ? String(row.from_assignee_id) : null,
        to_assignee_id: row.to_assignee_id ? String(row.to_assignee_id) : null,
        assigned_at: String(row.assigned_at),
      });
    }
  }

  const nameById = new Map<string, string>();
  if (staffById) {
    for (const [id, s] of Array.from(staffById.entries())) nameById.set(id, s.name);
  }
  const missing = new Set<string>();
  for (const log of logs) {
    if (log.from_assignee_id && !nameById.has(log.from_assignee_id)) missing.add(log.from_assignee_id);
    if (log.to_assignee_id && !nameById.has(log.to_assignee_id)) missing.add(log.to_assignee_id);
  }
  if (missing.size) {
    const missingIds = Array.from(missing);
    for (let i = 0; i < missingIds.length; i += IN_CHUNK) {
      const chunk = missingIds.slice(i, i + IN_CHUNK);
      const { data: staff } = await supabase.from("staff_users").select("id, name").in("id", chunk);
      for (const s of staff ?? []) nameById.set(String(s.id), String(s.name));
    }
  }
  const nameOf = (id: string | null | undefined) => (id ? nameById.get(id) ?? "" : "");

  const byCustomer = new Map<string, typeof logs>();
  for (const log of logs) {
    const list = byCustomer.get(log.customer_id) ?? [];
    list.push(log);
    byCustomer.set(log.customer_id, list);
  }

  return items.map((item) => {
    const chain = buildAssigneeNameChain(byCustomer.get(item.id) ?? [], nameOf);
    if (!chain.length && item.assignee_name) return { ...item, assignee_history: [item.assignee_name] };
    return { ...item, assignee_history: chain.length ? chain : undefined };
  });
}

export async function listTm001Customers(opts?: {
  q?: string;
  region?: string;
  status?: string;
  /** admin=all, 그 외 본인+산하 id */
  visibleAssigneeIds?: string[] | "all";
  limit?: number;
  offset?: number;
  includeHistory?: boolean;
  /** false면 숙박 총건 재집계 생략(페이지 이동 시) */
  includeStayTotal?: boolean;
  /** false면 지역 목록 생략(페이지 이동 시) */
  includeRegions?: boolean;
}): Promise<{ items: Tm001Customer[]; regions: string[]; total: number; stayTotal: number }> {
  const scoped = opts?.visibleAssigneeIds ?? "all";
  const limit = Math.min(Math.max(Number(opts?.limit) || 20, 1), 1000);
  const offset = Math.max(Number(opts?.offset) || 0, 0);
  const q = String(opts?.q ?? "").trim();
  const region = String(opts?.region ?? "").trim();
  const status = String(opts?.status ?? "").trim();
  const includeStayTotal = opts?.includeStayTotal !== false;
  const includeRegions = opts?.includeRegions !== false;

  if (scoped !== "all" && !scoped.length) {
    return { items: [], regions: [], total: 0, stayTotal: 0 };
  }

  const viaRpc = await listTm001CustomersViaRpc({
    q,
    region,
    status,
    scoped,
    limit,
    offset,
    includeStayTotal,
    includeRegions,
    includeHistory: Boolean(opts?.includeHistory),
  });
  if (viaRpc) return viaRpc;

  return listTm001CustomersFallback({
    q,
    region,
    status,
    scoped,
    limit,
    offset,
    includeStayTotal,
    includeRegions,
    includeHistory: Boolean(opts?.includeHistory),
  });
}

function escapeIlike(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

async function hydrateTm001Page(opts: {
  custRows: Record<string, unknown>[];
  includeHistory: boolean;
}): Promise<Tm001Customer[]> {
  const supabase = getSupabaseAdmin();
  const custRows = opts.custRows;
  const ids = custRows.map((r) => String(r.id));
  const staysByCustomer = new Map<string, Tm001Stay[]>();
  const IN_CHUNK = 80;

  if (ids.length) {
    for (let i = 0; i < ids.length; i += IN_CHUNK) {
      const chunk = ids.slice(i, i + IN_CHUNK);
      // 고객당 숙박이 여러 건일 수 있어 청크 내에서도 range 페이징
      const PAGE = 1000;
      for (let off = 0; ; off += PAGE) {
        const { data: stayRows, error: stayErr } = await supabase
          .from("tm001_stays")
          .select(
            "id, customer_id, batch_id, hotel_name, region, detail, stay_type, room, raw_room, raw_room_type, url, site_name, confidence, needs_review, sort_order, created_at"
          )
          .in("customer_id", chunk)
          .order("sort_order", { ascending: true })
          .range(off, off + PAGE - 1);
        if (stayErr) throw new Error(stayErr.message);
        const rows = stayRows ?? [];
        for (const s of rows) {
          const stay = mapStay(s as Record<string, unknown>);
          const list = staysByCustomer.get(stay.customer_id) ?? [];
          list.push(stay);
          staysByCustomer.set(stay.customer_id, list);
        }
        if (rows.length < PAGE) break;
      }
    }
  }

  const assigneeIds = Array.from(
    new Set(custRows.map((r) => r.assignee_id).filter(Boolean).map(String))
  );
  const staffById = new Map<string, StaffLite>();
  if (assigneeIds.length) {
    for (let i = 0; i < assigneeIds.length; i += IN_CHUNK) {
      const chunk = assigneeIds.slice(i, i + IN_CHUNK);
      const { data: staff } = await supabase.from("staff_users").select("id, name").in("id", chunk);
      for (const s of staff ?? []) staffById.set(String(s.id), { id: String(s.id), name: String(s.name) });
    }
  }

  let items: Tm001Customer[] = custRows.map((r) =>
    mapCustomerRow(r, staysByCustomer.get(String(r.id)) ?? [], staffById)
  );

  if (opts.includeHistory) {
    items = await attachTm001AssigneeHistories(items, staffById);
  } else {
    items = items.map((c) => (c.assignee_name ? { ...c, assignee_history: [c.assignee_name] } : c));
  }
  return items;
}

async function listTm001CustomersViaRpc(opts: {
  q: string;
  region: string;
  status: string;
  scoped: string[] | "all";
  limit: number;
  offset: number;
  includeStayTotal: boolean;
  includeRegions: boolean;
  includeHistory: boolean;
}): Promise<{ items: Tm001Customer[]; regions: string[]; total: number; stayTotal: number } | null> {
  const supabase = getSupabaseAdmin();
  const regionsPromise = opts.includeRegions ? listTm001Regions() : Promise.resolve([] as string[]);

  const { data, error } = await supabase.rpc("tm001_list_customers", {
    p_partner_code: TM001_PARTNER_CODE,
    p_q: opts.q || null,
    p_region: opts.region || null,
    p_status: opts.status || null,
    p_assignee_ids: opts.scoped === "all" ? null : opts.scoped,
    p_limit: opts.limit,
    p_offset: opts.offset,
    p_include_stay_total: opts.includeStayTotal,
  });

  if (error) {
    if (/tm001_list_customers|schema cache|does not exist|function/i.test(error.message)) {
      return null;
    }
    throw new Error(error.message);
  }

  const payload = (data ?? {}) as {
    total?: number;
    stay_total?: number;
    items?: Record<string, unknown>[];
  };
  const custRows = Array.isArray(payload.items) ? payload.items : [];
  const [items, regions] = await Promise.all([
    hydrateTm001Page({ custRows, includeHistory: opts.includeHistory }),
    regionsPromise,
  ]);

  return {
    items,
    regions,
    total: Number(payload.total ?? 0),
    stayTotal: opts.includeStayTotal ? Number(payload.stay_total ?? 0) : -1,
  };
}

/** RPC 미적용 환경용 — 전표 스캔/대량 id 재조회 없이 서버 페이징 */
async function listTm001CustomersFallback(opts: {
  q: string;
  region: string;
  status: string;
  scoped: string[] | "all";
  limit: number;
  offset: number;
  includeStayTotal: boolean;
  includeRegions: boolean;
  includeHistory: boolean;
}): Promise<{ items: Tm001Customer[]; regions: string[]; total: number; stayTotal: number }> {
  const supabase = getSupabaseAdmin();
  const { q, region, status, scoped, limit, offset } = opts;
  const CUSTOMER_COLS =
    "id, partner_code, partner_name, batch_code, name, phone, normalized_phone, raw_phone, visit_count, assignee_id, assigned_at, status, product, memo, comments, created_at, updated_at";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyBase = (query: any, withStaysInner: boolean) => {
    let next = query.eq("partner_code", TM001_PARTNER_CODE);
    if (scoped !== "all") next = next.in("assignee_id", scoped);
    if (status) next = next.eq("status", status);
    if (region) {
      if (withStaysInner) next = next.eq("tm001_stays.region", region);
      else next = next.eq("stays.region", region);
    }
    return next;
  };

  let total = 0;
  let stayTotal = -1;
  let custRows: Record<string, unknown>[] = [];

  if (q) {
    const pattern = `%${escapeIlike(q)}%`;
    const orFilter = `name.ilike."${pattern}",phone.ilike."${pattern}",normalized_phone.ilike."${pattern}"`;
    // 고객 필드 검색(페이징) + 숙소명 검색(상위 매칭 id)을 병렬로
    let nameCountQ = supabase
      .from("tm001_customers")
      .select("id", { count: "exact", head: true })
      .eq("partner_code", TM001_PARTNER_CODE)
      .or(orFilter);
    if (scoped !== "all") nameCountQ = nameCountQ.in("assignee_id", scoped);
    if (status) nameCountQ = nameCountQ.eq("status", status);

    let nameListQ = supabase
      .from("tm001_customers")
      .select(CUSTOMER_COLS)
      .eq("partner_code", TM001_PARTNER_CODE)
      .or(orFilter)
      .order("updated_at", { ascending: false })
      .range(0, Math.max(offset + limit - 1, limit - 1));
    if (scoped !== "all") nameListQ = nameListQ.in("assignee_id", scoped);
    if (status) nameListQ = nameListQ.eq("status", status);

    const hotelQ = supabase
      .from("tm001_stays")
      .select("customer_id")
      .ilike("hotel_name", pattern)
      .limit(300);

    const [nameCountRes, nameListRes, hotelRes] = await Promise.all([nameCountQ, nameListQ, hotelQ]);
    if (nameCountRes.error) throw new Error(nameCountRes.error.message);
    if (nameListRes.error) throw new Error(nameListRes.error.message);
    if (hotelRes.error) throw new Error(hotelRes.error.message);

    const byId = new Map<string, Record<string, unknown>>();
    for (const row of (nameListRes.data ?? []) as Record<string, unknown>[]) {
      byId.set(String(row.id), row);
    }

    const hotelIds = Array.from(
      new Set((hotelRes.data ?? []).map((r) => String(r.customer_id)).filter(Boolean))
    ).filter((id) => !byId.has(id));

    if (hotelIds.length) {
      for (let i = 0; i < hotelIds.length; i += 100) {
        const chunk = hotelIds.slice(i, i + 100);
        let hq = supabase
          .from("tm001_customers")
          .select(CUSTOMER_COLS)
          .eq("partner_code", TM001_PARTNER_CODE)
          .in("id", chunk);
        if (scoped !== "all") hq = hq.in("assignee_id", scoped);
        if (status) hq = hq.eq("status", status);
        const { data, error } = await hq;
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as Record<string, unknown>[]) {
          byId.set(String(row.id), row);
        }
      }
    }

    let merged = Array.from(byId.values());
    if (region) {
      const regionOk = new Set<string>();
      const { data: regionHits, error: regionErr } = await supabase
        .from("tm001_stays")
        .select("customer_id")
        .eq("region", region)
        .in(
          "customer_id",
          merged.map((r) => String(r.id)).slice(0, 200)
        );
      if (regionErr) throw new Error(regionErr.message);
      for (const r of regionHits ?? []) if (r.customer_id) regionOk.add(String(r.customer_id));
      // merged가 200 넘으면 추가 청크
      if (merged.length > 200) {
        for (let i = 200; i < merged.length; i += 100) {
          const chunk = merged.slice(i, i + 100).map((r) => String(r.id));
          const { data, error } = await supabase
            .from("tm001_stays")
            .select("customer_id")
            .eq("region", region)
            .in("customer_id", chunk);
          if (error) throw new Error(error.message);
          for (const r of data ?? []) if (r.customer_id) regionOk.add(String(r.customer_id));
        }
      }
      merged = merged.filter((r) => regionOk.has(String(r.id)));
    }

    merged.sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
    const hotelOnlyApprox = hotelIds.length;
    total = region ? merged.length : (nameCountRes.count ?? 0) + hotelOnlyApprox;
    custRows = merged.slice(offset, offset + limit);
    if (opts.includeStayTotal) {
      stayTotal = merged.reduce((n, r) => n + Number(r.visit_count ?? 0), 0);
    }
  } else if (region) {
    // inner join으로 지역 필터 + 서버 페이징
    const selectWithInner = `${CUSTOMER_COLS}, tm001_stays!inner(id)`;
    let countQ = supabase
      .from("tm001_customers")
      .select("id, tm001_stays!inner(id)", { count: "exact", head: true });
    countQ = applyBase(countQ, true);

    let listQ = supabase
      .from("tm001_customers")
      .select(selectWithInner)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);
    listQ = applyBase(listQ, true);

    const [countRes, listRes] = await Promise.all([countQ, listQ]);
    if (countRes.error) throw new Error(countRes.error.message);
    if (listRes.error) throw new Error(listRes.error.message);
    total = countRes.count ?? 0;
    custRows = ((listRes.data ?? []) as Record<string, unknown>[]).map((row) => {
      const { tm001_stays: _s, ...rest } = row as Record<string, unknown> & { tm001_stays?: unknown };
      return rest;
    });
    if (opts.includeStayTotal) {
      stayTotal = custRows.reduce((n, r) => n + Number(r.visit_count ?? 0), 0);
    }
  } else {
    let countQ = supabase
      .from("tm001_customers")
      .select("id", { count: "exact", head: true })
      .eq("partner_code", TM001_PARTNER_CODE);
    if (scoped !== "all") countQ = countQ.in("assignee_id", scoped);
    if (status) countQ = countQ.eq("status", status);

    let listQ = supabase
      .from("tm001_customers")
      .select(CUSTOMER_COLS)
      .eq("partner_code", TM001_PARTNER_CODE)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (scoped !== "all") listQ = listQ.in("assignee_id", scoped);
    if (status) listQ = listQ.eq("status", status);

    const [countRes, listRes, stayCountRes] = await Promise.all([
      countQ,
      listQ,
      opts.includeStayTotal && !status && scoped === "all"
        ? supabase.from("tm001_stays").select("id", { count: "exact", head: true })
        : Promise.resolve({ count: null as number | null, error: null }),
    ]);
    if (countRes.error) throw new Error(countRes.error.message);
    if (listRes.error) throw new Error(listRes.error.message);
    total = countRes.count ?? 0;
    custRows = (listRes.data ?? []) as Record<string, unknown>[];
    if (opts.includeStayTotal) {
      if (!stayCountRes.error && stayCountRes.count != null) stayTotal = stayCountRes.count;
      else stayTotal = custRows.reduce((n, r) => n + Number(r.visit_count ?? 0), 0);
    }
  }

  const [items, regions] = await Promise.all([
    hydrateTm001Page({ custRows, includeHistory: opts.includeHistory }),
    opts.includeRegions ? listTm001Regions() : Promise.resolve([] as string[]),
  ]);

  return { items, regions, total, stayTotal };
}

async function listTm001Regions(): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("tm001_list_regions");
  if (!error && Array.isArray(data)) {
    return (data as string[]).map((r) => String(r).trim()).filter(Boolean);
  }

  // RPC 없을 때: 페이지 스캔 대신 상한만 (드롭다운용)
  const set = new Set<string>();
  const PAGE = 1000;
  for (let off = 0; off < 5000; off += PAGE) {
    const { data: rows, error: scanErr } = await supabase
      .from("tm001_stays")
      .select("region")
      .neq("region", "")
      .range(off, off + PAGE - 1);
    if (scanErr) {
      console.warn("listTm001Regions:", scanErr.message);
      break;
    }
    const chunk = rows ?? [];
    for (const r of chunk) {
      const v = String(r.region || "").trim();
      if (v) set.add(v);
    }
    if (chunk.length < PAGE) break;
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
}

export function isTm001CustomerVisible(
  customer: { assignee_id?: string | null },
  scoped: string[] | "all"
): boolean {
  if (scoped === "all") return true;
  const aid = customer.assignee_id ? String(customer.assignee_id) : "";
  return Boolean(aid && scoped.includes(aid));
}

function mergeDuplicateMemo(memo: string, currentBatch: string, otherBatches: string[]): string {
  const others = Array.from(new Set(otherBatches.filter((b) => b && b !== currentBatch))).sort();
  if (!others.length) return memo;
  const tag = `[중복] 동일 연락처 · 다른 차수 ${others.join(", ")} (현재 ${currentBatch})`;
  const lines = String(memo ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !l.startsWith("[중복]"));
  lines.unshift(tag);
  return lines.join("\n");
}

export async function importTm001ExcelRows(opts: {
  rows: Tm001ExcelStayRow[];
  filename?: string;
  uploadedBy?: string | null;
  uploadedByName?: string | null;
}): Promise<{
  batch_code: string;
  batch_id: string;
  customers_created: number;
  customers_updated: number;
  stays_inserted: number;
  cross_batch_duplicates: number;
}> {
  const supabase = getSupabaseAdmin();
  // 업로드 1회 = 새 DB 차수 (자동 증가). 제휴사는 TM001 고정.
  const batchCode = await nextTm001BatchCode();

  const { data: batch, error: batchErr } = await supabase
    .from("tm001_batches")
    .insert({
      batch_code: batchCode,
      partner_code: TM001_PARTNER_CODE,
      partner_name: TM001_PARTNER_NAME,
      source_filename: opts.filename ?? null,
      uploaded_by: opts.uploadedBy ?? null,
      uploaded_by_name: opts.uploadedByName ?? null,
      stay_row_count: opts.rows.length,
      customer_count: 0,
    })
    .select("id, batch_code")
    .single();
  if (batchErr) {
    if (/duplicate|unique/i.test(batchErr.message)) {
      throw new Error(`이미 존재하는 DB 차수입니다: ${batchCode}`);
    }
    throw new Error(batchErr.message);
  }
  const batchId = String(batch.id);

  // 같은 업로드(차수) 안에서는 연락처 기준 1행으로 병합 (다른 이름은 고객명 괄호에 표기)
  const byPhone = new Map<string, Tm001ExcelStayRow[]>();
  for (const row of opts.rows) {
    const list = byPhone.get(row.normalizedPhone) ?? [];
    list.push(row);
    byPhone.set(row.normalizedPhone, list);
  }

  let created = 0;
  let updated = 0;
  let staysInserted = 0;
  let crossBatchDuplicates = 0;
  const nowIso = new Date().toISOString();
  const touchedIds: string[] = [];

  for (const [phone, stayRows] of Array.from(byPhone.entries())) {
    const first = stayRows[0];
    const displayName = formatMergedCustomerName(stayRows.map((r) => r.name));
    const visitCount = Math.max(...stayRows.map((r: Tm001ExcelStayRow) => r.visitCount || 0), stayRows.length);

    // 다른 차수의 동일 연락처 (병합하지 않음 — 메모만)
    const { data: otherRows } = await supabase
      .from("tm001_customers")
      .select("id, batch_code, memo")
      .eq("partner_code", TM001_PARTNER_CODE)
      .eq("normalized_phone", phone)
      .neq("batch_code", batchCode);

    const otherBatches = (otherRows ?? []).map((r) => String(r.batch_code));
    const hasCross = otherBatches.length > 0;
    if (hasCross) crossBatchDuplicates += 1;

    // 같은 차수·전화만 upsert
    const { data: existing } = await supabase
      .from("tm001_customers")
      .select("id, visit_count, memo")
      .eq("partner_code", TM001_PARTNER_CODE)
      .eq("batch_code", batchCode)
      .eq("normalized_phone", phone)
      .maybeSingle();

    let customerId: string;
    const memo = hasCross
      ? mergeDuplicateMemo(String(existing?.memo ?? ""), batchCode, otherBatches)
      : String(existing?.memo ?? "").split("\n").filter((l) => !l.trim().startsWith("[동일연락처]")).join("\n");

    if (existing?.id) {
      customerId = String(existing.id);
      const { error: updErr } = await supabase
        .from("tm001_customers")
        .update({
          name: displayName,
          phone: first.phoneDisplay,
          raw_phone: first.rawPhone,
          visit_count: Math.max(Number(existing.visit_count ?? 0), visitCount),
          memo,
          updated_at: nowIso,
        })
        .eq("id", customerId);
      if (updErr) throw new Error(updErr.message);
      updated += 1;
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("tm001_customers")
        .insert({
          partner_code: TM001_PARTNER_CODE,
          partner_name: TM001_PARTNER_NAME,
          batch_code: batchCode,
          name: displayName,
          phone: first.phoneDisplay,
          normalized_phone: phone,
          raw_phone: first.rawPhone,
          visit_count: visitCount,
          status: "미접촉",
          memo: hasCross ? mergeDuplicateMemo("", batchCode, otherBatches) : "",
          comments: [],
        })
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);
      customerId = String(inserted.id);
      created += 1;
    }
    touchedIds.push(customerId);

    // 기존 다른 차수 행에도 중복 메모 갱신
    for (const other of otherRows ?? []) {
      const otherId = String(other.id);
      const otherBatch = String(other.batch_code);
      const peerBatches = Array.from(
        new Set([batchCode, ...otherBatches.filter((b) => b !== otherBatch)])
      );
      const nextMemo = mergeDuplicateMemo(String(other.memo ?? ""), otherBatch, peerBatches);
      if (nextMemo !== String(other.memo ?? "")) {
        await supabase
          .from("tm001_customers")
          .update({ memo: nextMemo, updated_at: nowIso })
          .eq("id", otherId);
      }
    }

    const { data: maxStay } = await supabase
      .from("tm001_stays")
      .select("sort_order")
      .eq("customer_id", customerId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const sortBase = Number(maxStay?.sort_order ?? -1) + 1;

    const payloads = stayRows.map((r: Tm001ExcelStayRow, idx: number) => ({
      customer_id: customerId,
      batch_id: batchId,
      hotel_name: r.hotelName,
      region: r.region,
      detail: r.detail,
      stay_type: r.stayType,
      room: r.room,
      raw_room: r.rawRoom,
      raw_room_type: r.rawRoomType,
      url: r.url,
      site_name: r.siteName,
      confidence: r.confidence,
      needs_review: r.needsReview,
      sort_order: sortBase + idx,
    }));

    for (let i = 0; i < payloads.length; i += 200) {
      const chunk = payloads.slice(i, i + 200);
      const { error: stayErr } = await supabase.from("tm001_stays").insert(chunk);
      if (stayErr) throw new Error(stayErr.message);
      staysInserted += chunk.length;
    }
  }

  await supabase
    .from("tm001_batches")
    .update({ customer_count: byPhone.size, stay_row_count: opts.rows.length })
    .eq("id", batchId);

  return {
    batch_code: batchCode,
    batch_id: batchId,
    customers_created: created,
    customers_updated: updated,
    stays_inserted: staysInserted,
    cross_batch_duplicates: crossBatchDuplicates,
  };
}

export async function patchTm001Customer(
  id: string,
  patch: {
    status?: string;
    product?: string | null;
    memo?: string;
    comment_append?: string;
    comment_by?: string;
    assignee_id?: string | null;
  },
  session: SessionUser
): Promise<Tm001Customer> {
  const supabase = getSupabaseAdmin();
  const { data: current, error: findErr } = await supabase.from("tm001_customers").select("*").eq("id", id).maybeSingle();
  if (findErr) throw new Error(findErr.message);
  if (!current) throw new Error("고객을 찾을 수 없습니다.");

  const next: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let nextMemo = String(current.memo ?? "");

  if (patch.status != null) {
    if (!isTm001Status(patch.status)) throw new Error("허용되지 않은 상담상태입니다.");
    const prevStatus = String(current.status ?? "");
    next.status = patch.status;
    if (patch.status !== "계약완료") next.product = null;
    if (patch.status !== prevStatus) {
      nextMemo = appendStatusMemo(nextMemo, patch.status);
      next.memo = nextMemo;
    }
  }
  if (patch.product !== undefined) {
    if (patch.product == null || patch.product === "") next.product = null;
    else if (!isTm001Product(patch.product)) throw new Error("허용되지 않은 상품입니다.");
    else next.product = patch.product;
  }
  // 상담상태와 함께 온 메모는 후보자 DB와 같이 상태 자동기록을 유지 (명시 memo만 별도 저장)
  if (patch.memo !== undefined && patch.status == null) {
    next.memo = String(patch.memo ?? "");
  }
  if (patch.comment_append != null && String(patch.comment_append).trim()) {
    const comments = mapComments(current.comments);
    comments.push({
      id: crypto.randomUUID(),
      text: String(patch.comment_append).trim(),
      at: new Date().toISOString(),
      by: patch.comment_by,
    });
    next.comments = comments;
  }

  const curAssignee = current.assignee_id ? String(current.assignee_id) : null;
  if (patch.assignee_id !== undefined) {
    if (!canChangeTm001Assignee(session)) {
      throw new Error("담당자를 변경할 권한이 없습니다.");
    }
    const nextAssignee = patch.assignee_id ? String(patch.assignee_id) : null;
    const scoped = await tm001VisibleAssigneeIds(session);
    if (!canAssignTm001To(session, nextAssignee, scoped)) {
      throw new Error("본인 또는 산하 담당자에게만 배정할 수 있습니다.");
    }
    if (nextAssignee !== curAssignee) {
      const nowIso = new Date().toISOString();
      next.assignee_id = nextAssignee;
      next.assigned_at = nextAssignee ? nowIso : null;
      const { error: logErr } = await supabase.from("tm001_assignment_logs").insert({
        customer_id: id,
        from_assignee_id: curAssignee,
        to_assignee_id: nextAssignee,
        assigned_at: nowIso,
        changed_by: session.userId || null,
        changed_by_name: session.name,
        reason: "manual",
      });
      if (logErr) throw new Error(logErr.message);
    }
  }

  const { error: updErr } = await supabase.from("tm001_customers").update(next).eq("id", id);
  if (updErr) throw new Error(updErr.message);

  const found = await getTm001CustomerById(id, { includeStays: false, includeHistory: true });
  if (!found) throw new Error("저장 후 조회에 실패했습니다.");
  return found;
}

export async function bulkAssignTm001(
  ids: string[],
  assigneeId: string | null,
  session: SessionUser
): Promise<{ updated: number }> {
  if (!canChangeTm001Assignee(session)) {
    throw new Error("담당자를 변경할 권한이 없습니다.");
  }
  const scoped = await tm001VisibleAssigneeIds(session);
  const nextAssignee = assigneeId ? String(assigneeId) : null;
  if (!canAssignTm001To(session, nextAssignee, scoped)) {
    throw new Error("본인 또는 산하 담당자에게만 배정할 수 있습니다.");
  }
  const supabase = getSupabaseAdmin();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return { updated: 0 };
  const nowIso = new Date().toISOString();
  const IN_CHUNK = 100;
  let updated = 0;

  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    const chunk = unique.slice(i, i + IN_CHUNK);
    const { data: rows, error: loadErr } = await supabase
      .from("tm001_customers")
      .select("id, assignee_id")
      .in("id", chunk);
    if (loadErr) throw new Error(loadErr.message);

    const toUpdate: string[] = [];
    const logs: Array<Record<string, unknown>> = [];
    for (const row of rows ?? []) {
      const id = String(row.id);
      const from = row.assignee_id ? String(row.assignee_id) : null;
      if (scoped !== "all") {
        if (!from || !scoped.includes(from)) continue;
      }
      if (from === nextAssignee) continue;
      toUpdate.push(id);
      logs.push({
        customer_id: id,
        from_assignee_id: from,
        to_assignee_id: nextAssignee,
        assigned_at: nowIso,
        changed_by: session.userId || null,
        changed_by_name: session.name,
        reason: "manual",
      });
    }
    if (!toUpdate.length) continue;

    if (logs.length) {
      const { error: logErr } = await supabase.from("tm001_assignment_logs").insert(logs);
      if (logErr) throw new Error(logErr.message);
    }

    const { error, count } = await supabase
      .from("tm001_customers")
      .update({
        assignee_id: nextAssignee,
        assigned_at: nextAssignee ? nowIso : null,
        updated_at: nowIso,
      })
      .in("id", toUpdate);
    if (error) throw new Error(error.message);
    updated += count ?? toUpdate.length;
  }
  return { updated };
}

/** 관리자 전용 — 선택 고객 삭제 (숙박·배정이력 CASCADE) */
export async function deleteTm001Customers(
  ids: string[],
  session: SessionUser
): Promise<{ deleted: number }> {
  if (session.rank !== "admin") {
    throw new Error("관리자만 삭제할 수 있습니다.");
  }
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return { deleted: 0 };
  if (unique.length > 200) {
    throw new Error("한 번에 200건까지 삭제할 수 있습니다.");
  }

  const supabase = getSupabaseAdmin();
  const IN_CHUNK = 100;
  let deleted = 0;
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    const chunk = unique.slice(i, i + IN_CHUNK);
    const { error, count } = await supabase.from("tm001_customers").delete().in("id", chunk);
    if (error) throw new Error(error.message);
    deleted += count ?? chunk.length;
  }
  return { deleted };
}

export type { Tm001Status };
