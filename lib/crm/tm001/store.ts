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
import { canChangeAssignee } from "@/lib/crm/scope";
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
}): Promise<{ items: Tm001Customer[]; regions: string[] }> {
  const supabase = getSupabaseAdmin();
  const scoped = opts?.visibleAssigneeIds ?? "all";
  // PostgREST 기본 max 1000행 — 전체 고객을 range로 수집
  const PAGE = 1000;
  const custRows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let query = supabase
      .from("tm001_customers")
      .select("*")
      .eq("partner_code", TM001_PARTNER_CODE)
      .order("updated_at", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (scoped !== "all") {
      if (!scoped.length) break;
      query = query.in("assignee_id", scoped);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as Record<string, unknown>[];
    custRows.push(...chunk);
    if (chunk.length < PAGE) break;
  }

  const ids = custRows.map((r) => String(r.id));
  const staysByCustomer = new Map<string, Tm001Stay[]>();
  // PostgREST URL 길이 제한 — UUID 대량 .in() 시 Bad Request 방지
  const IN_CHUNK = 100;
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const { data: stayRows, error: stayErr } = await supabase
      .from("tm001_stays")
      .select("*")
      .in("customer_id", chunk)
      .order("sort_order", { ascending: true });
    if (stayErr) throw new Error(stayErr.message);
    for (const s of stayRows ?? []) {
      const stay = mapStay(s as Record<string, unknown>);
      const list = staysByCustomer.get(stay.customer_id) ?? [];
      list.push(stay);
      staysByCustomer.set(stay.customer_id, list);
    }
  }

  const assigneeIds = Array.from(
    new Set(custRows.map((r) => r.assignee_id).filter(Boolean).map(String))
  );
  const staffById = new Map<string, StaffLite>();
  for (let i = 0; i < assigneeIds.length; i += IN_CHUNK) {
    const chunk = assigneeIds.slice(i, i + IN_CHUNK);
    const { data: staff } = await supabase.from("staff_users").select("id, name").in("id", chunk);
    for (const s of staff ?? []) staffById.set(String(s.id), { id: String(s.id), name: String(s.name) });
  }

  const regionSet = new Set<string>();
  let items: Tm001Customer[] = custRows.map((r) => {
    const stays = staysByCustomer.get(String(r.id)) ?? [];
    for (const s of stays) if (s.region) regionSet.add(s.region);
    return mapCustomerRow(r, stays, staffById);
  });

  items = await attachTm001AssigneeHistories(items, staffById);

  const q = String(opts?.q ?? "").trim().toLowerCase();
  const region = String(opts?.region ?? "").trim();
  const status = String(opts?.status ?? "").trim();

  if (q) {
    items = items.filter((c) => {
      const hay = [c.name, c.phone, c.normalized_phone, c.partner_name, c.batch_code, ...c.stays.flatMap((s) => [s.hotel_name, s.region, s.detail, s.room])]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }
  if (region) {
    items = items.filter((c) => c.stays.some((s) => s.region === region));
  }
  if (status) {
    items = items.filter((c) => c.status === status);
  }

  return { items, regions: Array.from(regionSet).sort((a, b) => a.localeCompare(b, "ko")) };
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
    if (!canChangeAssignee(session)) {
      throw new Error("담당자를 변경할 권한이 없습니다.");
    }
    const nextAssignee = patch.assignee_id ? String(patch.assignee_id) : null;
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
  if (!canChangeAssignee(session)) {
    throw new Error("담당자를 변경할 권한이 없습니다.");
  }
  const supabase = getSupabaseAdmin();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return { updated: 0 };
  const nextAssignee = assigneeId ? String(assigneeId) : null;
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
