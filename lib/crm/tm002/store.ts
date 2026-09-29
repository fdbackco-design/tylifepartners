import type { Tm002ExcelRow } from "@/lib/crm/tm002/excel";
import {
  TM002_PARTNER_CODE,
  TM002_PARTNER_NAME,
  formatBatchCode,
  formatMergedCustomerName,
  isTm002Product,
  isTm002ScheduledStatus,
  isTm002Status,
  type Tm002Comment,
  type Tm002Customer,
  type Tm002Status,
} from "@/lib/crm/tm002/types";
import { buildAssigneeNameChain } from "@/lib/crm/assigneeHistoryFormat";
import { addDaysYmd, parseKstYmd } from "@/lib/crm/kst";
import { appendStatusMemo } from "@/lib/crm/memo";
import { canAssignTm002To, canChangeTm002Assignee, canEditAdminComment, tm002VisibleAssigneeIds } from "@/lib/crm/scope";
import type { SessionUser } from "@/lib/crm/types";
import { getSupabaseAdmin } from "@/lib/supabase";

type StaffLite = { id: string; name: string };

const CUSTOMER_COLUMNS =
  "id, partner_code, partner_name, batch_code, name, phone, normalized_phone, raw_phone, joined_at, flag, level, address, address_detail, assignee_id, assigned_at, status, product, meeting_at, memo, memo_admin_unread, comments, created_at, updated_at";

function mapComments(raw: unknown): Tm002Comment[] {
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
    .filter(Boolean) as Tm002Comment[];
}

export async function nextTm002BatchCode(partnerCode = TM002_PARTNER_CODE): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tm002_batches")
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

function mapCustomerRow(r: Record<string, unknown>, staffById: Map<string, StaffLite>): Tm002Customer {
  const status = isTm002Status(r.status) ? r.status : "미접촉";
  return {
    id: String(r.id),
    partner_code: String(r.partner_code ?? TM002_PARTNER_CODE),
    partner_name: String(r.partner_name ?? TM002_PARTNER_NAME),
    batch_code: String(r.batch_code ?? "001"),
    name: String(r.name ?? ""),
    phone: String(r.phone ?? ""),
    normalized_phone: String(r.normalized_phone ?? ""),
    raw_phone: r.raw_phone != null ? String(r.raw_phone) : null,
    joined_at: r.joined_at ? String(r.joined_at) : null,
    flag: String(r.flag ?? ""),
    level: String(r.level ?? ""),
    address: String(r.address ?? ""),
    address_detail: String(r.address_detail ?? ""),
    assignee_id: r.assignee_id ? String(r.assignee_id) : null,
    assignee_name: r.assignee_id ? staffById.get(String(r.assignee_id))?.name ?? null : null,
    assigned_at: r.assigned_at ? String(r.assigned_at) : null,
    status,
    product: r.product != null ? String(r.product) : null,
    meeting_at: r.meeting_at ? String(r.meeting_at) : null,
    memo: String(r.memo ?? ""),
    memo_admin_unread: Boolean(r.memo_admin_unread),
    comments: mapComments(r.comments),
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

async function loadStaffNames(ids: string[]): Promise<Map<string, StaffLite>> {
  const staffById = new Map<string, StaffLite>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const supabase = getSupabaseAdmin();
  const IN_CHUNK = 80;
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    const { data: staff } = await supabase.from("staff_users").select("id, name").in("id", unique.slice(i, i + IN_CHUNK));
    for (const s of staff ?? []) staffById.set(String(s.id), { id: String(s.id), name: String(s.name) });
  }
  return staffById;
}

export async function getTm002CustomerById(
  id: string,
  opts?: { includeHistory?: boolean }
): Promise<Tm002Customer | null> {
  const supabase = getSupabaseAdmin();
  const { data: row, error } = await supabase.from("tm002_customers").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;

  const staffById = await loadStaffNames(row.assignee_id ? [String(row.assignee_id)] : []);
  const item = mapCustomerRow(row as Record<string, unknown>, staffById);
  if (opts?.includeHistory) {
    const [withHist] = await attachTm002AssigneeHistories([item], staffById);
    return withHist ?? item;
  }
  return item;
}

async function attachTm002AssigneeHistories(
  items: Tm002Customer[],
  staffById?: Map<string, StaffLite>
): Promise<Tm002Customer[]> {
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
      .from("tm002_assignment_logs")
      .select("customer_id, from_assignee_id, to_assignee_id, assigned_at")
      .in("customer_id", chunk)
      .order("assigned_at", { ascending: true });
    if (error) {
      // 마이그레이션 전이면 이력 없이 목록만
      if (/tm002_assignment_logs|schema cache|does not exist/i.test(error.message)) break;
      console.error("attachTm002AssigneeHistories:", error.message);
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

function resolveTm002AssigneeFilter(
  scoped: string[] | "all",
  assigneeId: string,
  unassignedOnly: boolean
): { scoped: string[] | "all"; unassignedOnly: boolean } | "empty" {
  if (unassignedOnly) {
    // 가시 범위가 담당자 id로 제한된 계정은 미배정 건을 볼 수 없음
    if (scoped !== "all") return "empty";
    return { scoped: "all", unassignedOnly: true };
  }
  if (assigneeId) {
    if (scoped === "all") return { scoped: [assigneeId], unassignedOnly: false };
    if (!scoped.includes(assigneeId)) return "empty";
    return { scoped: [assigneeId], unassignedOnly: false };
  }
  return { scoped, unassignedOnly: false };
}

function applyAssignedDateFilter<T extends { gte: (c: string, v: string) => T; lt: (c: string, v: string) => T }>(
  query: T,
  assignedDate: string
): T {
  if (!assignedDate) return query;
  const start = parseKstYmd(assignedDate).toISOString();
  const end = parseKstYmd(addDaysYmd(assignedDate, 1)).toISOString();
  return query.gte("assigned_at", start).lt("assigned_at", end);
}

export async function listTm002Customers(opts?: {
  q?: string;
  status?: string;
  /** 점검 알림 등 — 이 ID만 조회 */
  ids?: string[];
  /** 특정 담당자만 (가시 범위와 교집합) */
  assigneeId?: string;
  /** 미배정만 */
  unassignedOnly?: boolean;
  /** KST YYYY-MM-DD 배정일 */
  assignedDate?: string;
  /** admin=all, 그 외 본인+산하 id */
  visibleAssigneeIds?: string[] | "all";
  limit?: number;
  offset?: number;
  includeHistory?: boolean;
}): Promise<{ items: Tm002Customer[]; total: number }> {
  const visible = opts?.visibleAssigneeIds ?? "all";
  const limit = Math.min(Math.max(Number(opts?.limit) || 20, 1), 1000);
  const offset = Math.max(Number(opts?.offset) || 0, 0);
  // or() 필터 문법을 깨는 문자 제거
  const q = String(opts?.q ?? "").replace(/["\\,()]/g, " ").trim();
  const status = String(opts?.status ?? "").trim();
  const ids = Array.from(new Set((opts?.ids ?? []).map((id) => String(id).trim()).filter(Boolean))).slice(0, 200);

  if (visible !== "all" && !visible.length) return { items: [], total: 0 };
  const resolved = resolveTm002AssigneeFilter(
    visible,
    String(opts?.assigneeId ?? "").trim(),
    Boolean(opts?.unassignedOnly)
  );
  if (resolved === "empty") return { items: [], total: 0 };

  const supabase = getSupabaseAdmin();
  let qb = supabase
    .from("tm002_customers")
    .select(CUSTOMER_COLUMNS, { count: "exact" })
    .eq("partner_code", TM002_PARTNER_CODE);
  if (ids.length) qb = qb.in("id", ids);
  if (status) qb = qb.eq("status", status);
  if (resolved.unassignedOnly) qb = qb.is("assignee_id", null);
  else if (resolved.scoped !== "all") qb = qb.in("assignee_id", resolved.scoped);
  qb = applyAssignedDateFilter(qb, String(opts?.assignedDate ?? "").trim());
  if (q) {
    const p = `"%${q}%"`;
    const digits = q.replace(/\D/g, "");
    const fields = ["name", "phone", "address", "address_detail"].map((f) => `${f}.ilike.${p}`);
    if (digits.length >= 3) fields.push(`normalized_phone.ilike."%${digits}%"`);
    qb = qb.or(fields.join(","));
  }

  const { data, error, count } = await qb
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);

  const custRows = (data ?? []) as unknown as Record<string, unknown>[];
  const staffById = await loadStaffNames(custRows.map((r) => String(r.assignee_id ?? "")));
  let items = custRows.map((r) => mapCustomerRow(r, staffById));
  items = opts?.includeHistory
    ? await attachTm002AssigneeHistories(items, staffById)
    : items.map((c) => (c.assignee_name ? { ...c, assignee_history: [c.assignee_name] } : c));
  return { items, total: count ?? items.length };
}

export function isTm002CustomerVisible(
  customer: { assignee_id?: string | null },
  scoped: string[] | "all"
): boolean {
  if (scoped === "all") return true;
  const aid = customer.assignee_id ? String(customer.assignee_id) : "";
  return Boolean(aid && scoped.includes(aid));
}

const INSERT_CHUNK = 500;

export async function importTm002ExcelRows(opts: {
  rows: Tm002ExcelRow[];
  filename?: string;
  uploadedBy?: string | null;
  uploadedByName?: string | null;
}): Promise<{
  batch_code: string;
  batch_id: string;
  customers_created: number;
  merged_rows: number;
  cross_batch_duplicates: number;
}> {
  const supabase = getSupabaseAdmin();
  // 업로드 1회 = 새 DB 차수 (자동 증가)
  const batchCode = await nextTm002BatchCode();

  // 같은 업로드 안에서는 연락처 기준 1행으로 병합 (다른 이름은 고객명 괄호에 표기)
  const byPhone = new Map<string, Tm002ExcelRow[]>();
  for (const row of opts.rows) {
    const list = byPhone.get(row.normalizedPhone) ?? [];
    list.push(row);
    byPhone.set(row.normalizedPhone, list);
  }

  const { data: batch, error: batchErr } = await supabase
    .from("tm002_batches")
    .insert({
      batch_code: batchCode,
      partner_code: TM002_PARTNER_CODE,
      partner_name: TM002_PARTNER_NAME,
      source_filename: opts.filename ?? null,
      uploaded_by: opts.uploadedBy ?? null,
      uploaded_by_name: opts.uploadedByName ?? null,
      stay_row_count: opts.rows.length,
      customer_count: byPhone.size,
    })
    .select("id")
    .single();
  if (batchErr) {
    if (/duplicate|unique/i.test(batchErr.message)) throw new Error(`이미 존재하는 DB 차수입니다: ${batchCode}`);
    throw new Error(batchErr.message);
  }

  const records = Array.from(byPhone.entries()).map(([phone, group]) => {
    // 같은 연락처의 여러 행 → 엑셀에서 먼저 나온 행의 flag/레벨/주소를 그대로 쓴다
    const rep = group[0];
    return {
      partner_code: TM002_PARTNER_CODE,
      partner_name: TM002_PARTNER_NAME,
      batch_code: batchCode,
      name: formatMergedCustomerName(group.map((r) => r.name)),
      phone: rep.phoneDisplay,
      normalized_phone: phone,
      raw_phone: rep.rawPhone,
      joined_at: rep.joinedAt,
      flag: rep.flag,
      level: rep.level,
      address: rep.address,
      address_detail: rep.addressDetail,
      status: "미접촉",
      memo: "",
      comments: [],
    };
  });

  try {
    for (let i = 0; i < records.length; i += INSERT_CHUNK) {
      const { error } = await supabase.from("tm002_customers").insert(records.slice(i, i + INSERT_CHUNK));
      if (error) throw new Error(error.message);
    }
  } catch (e) {
    // 일부만 들어간 차수가 남지 않도록 되돌린다 (되돌리기 실패는 원래 오류를 가리지 않고 기록만 남긴다)
    const undoCustomers = await supabase
      .from("tm002_customers")
      .delete()
      .eq("partner_code", TM002_PARTNER_CODE)
      .eq("batch_code", batchCode);
    const undoBatch = await supabase.from("tm002_batches").delete().eq("id", batch.id);
    if (undoCustomers.error || undoBatch.error) {
      console.error(
        `TM002 업로드 되돌리기 실패 (차수 ${batchCode}) — 수동 정리 필요:`,
        undoCustomers.error?.message,
        undoBatch.error?.message
      );
    }
    throw e;
  }

  // 다른 차수에 이미 있는 연락처 수 (병합하지 않고 알려주기만 한다. TM001처럼 번호 수 기준)
  const phones = Array.from(byPhone.keys());
  const seenElsewhere = new Set<string>();
  for (let i = 0; i < phones.length; i += 200) {
    const { data } = await supabase
      .from("tm002_customers")
      .select("normalized_phone")
      .eq("partner_code", TM002_PARTNER_CODE)
      .neq("batch_code", batchCode)
      .in("normalized_phone", phones.slice(i, i + 200));
    for (const r of data ?? []) seenElsewhere.add(String(r.normalized_phone));
  }
  const crossBatchDuplicates = seenElsewhere.size;

  return {
    batch_code: batchCode,
    batch_id: String(batch.id),
    customers_created: records.length,
    merged_rows: opts.rows.length - records.length,
    cross_batch_duplicates: crossBatchDuplicates,
  };
}

export async function patchTm002Customer(
  id: string,
  patch: {
    status?: string;
    product?: string | null;
    meeting_at?: string | null;
    memo?: string;
    /** 관리자·매니저 메모 열람 시 미확인 해제 */
    memo_seen?: boolean;
    comment_append?: string;
    comment_by?: string;
    assignee_id?: string | null;
  },
  session: SessionUser
): Promise<Tm002Customer> {
  const supabase = getSupabaseAdmin();
  const { data: current, error: findErr } = await supabase.from("tm002_customers").select("*").eq("id", id).maybeSingle();
  if (findErr) throw new Error(findErr.message);
  if (!current) throw new Error("고객을 찾을 수 없습니다.");

  const next: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let nextMemo = String(current.memo ?? "");
  const nextStatus =
    patch.status != null && isTm002Status(patch.status) ? patch.status : String(current.status ?? "");

  if (patch.status != null) {
    if (!isTm002Status(patch.status)) throw new Error("허용되지 않은 상담상태입니다.");
    const prevStatus = String(current.status ?? "");
    next.status = patch.status;
    if (patch.status !== "계약완료") next.product = null;
    if (patch.status !== prevStatus) {
      nextMemo = appendStatusMemo(nextMemo, patch.status);
      next.memo = nextMemo;
    }
    if (!isTm002ScheduledStatus(patch.status) && patch.meeting_at === undefined) {
      next.meeting_at = null;
    }
  }
  if (patch.product !== undefined) {
    if (patch.product == null || patch.product === "") next.product = null;
    else if (!isTm002Product(patch.product)) throw new Error("허용되지 않은 상품입니다.");
    else next.product = patch.product;
  }
  if (patch.meeting_at !== undefined) {
    if (patch.meeting_at == null || patch.meeting_at === "") {
      next.meeting_at = null;
    } else {
      if (!isTm002ScheduledStatus(nextStatus)) {
        throw new Error("재콜 상태에서만 일정을 지정할 수 있습니다.");
      }
      const t = Date.parse(String(patch.meeting_at));
      if (!Number.isFinite(t)) throw new Error("일정 형식이 올바르지 않습니다.");
      next.meeting_at = new Date(t).toISOString();
    }
  }
  // 상담상태와 함께 온 메모는 후보자 DB와 같이 상태 자동기록을 유지 (명시 memo만 별도 저장)
  if (patch.memo !== undefined && patch.status == null) {
    const nextMemoText = String(patch.memo ?? "");
    next.memo = nextMemoText;
    if (session.rank === "sales" && nextMemoText !== String(current.memo ?? "")) {
      next.memo_admin_unread = true;
    }
  }
  if (patch.memo_seen && canEditAdminComment(session) && current.memo_admin_unread) {
    next.memo_admin_unread = false;
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
    if (!canChangeTm002Assignee(session)) {
      throw new Error("담당자를 변경할 권한이 없습니다.");
    }
    const nextAssignee = patch.assignee_id ? String(patch.assignee_id) : null;
    const scoped = await tm002VisibleAssigneeIds(session);
    if (!canAssignTm002To(session, nextAssignee, scoped)) {
      throw new Error("본인 또는 산하 담당자에게만 배정할 수 있습니다.");
    }
    if (nextAssignee !== curAssignee) {
      const nowIso = new Date().toISOString();
      next.assignee_id = nextAssignee;
      next.assigned_at = nextAssignee ? nowIso : null;
      const { error: logErr } = await supabase.from("tm002_assignment_logs").insert({
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

  const { error: updErr } = await supabase.from("tm002_customers").update(next).eq("id", id);
  if (updErr) throw new Error(updErr.message);

  const found = await getTm002CustomerById(id, { includeHistory: true });
  if (!found) throw new Error("저장 후 조회에 실패했습니다.");
  return found;
}

export async function bulkAssignTm002(
  ids: string[],
  assigneeId: string | null,
  session: SessionUser
): Promise<{ updated: number }> {
  if (!canChangeTm002Assignee(session)) {
    throw new Error("담당자를 변경할 권한이 없습니다.");
  }
  const scoped = await tm002VisibleAssigneeIds(session);
  const nextAssignee = assigneeId ? String(assigneeId) : null;
  if (!canAssignTm002To(session, nextAssignee, scoped)) {
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
      .from("tm002_customers")
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
      const { error: logErr } = await supabase.from("tm002_assignment_logs").insert(logs);
      if (logErr) throw new Error(logErr.message);
    }

    const { error, count } = await supabase
      .from("tm002_customers")
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

/** 관리자 전용 — 선택 고객 삭제 (배정이력 CASCADE) */
export async function deleteTm002Customers(
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
    const { error, count } = await supabase.from("tm002_customers").delete().in("id", chunk);
    if (error) throw new Error(error.message);
    deleted += count ?? chunk.length;
  }
  return { deleted };
}

export type { Tm002Status };
