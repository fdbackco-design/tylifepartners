import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { toExcelXml } from "@/lib/crm/excel";
import { keepExportRow, mergePhoneSets, phonesFromText, phonesFromWorkbook } from "@/lib/crm/exportExclude";
import { formatKstDateTime } from "@/lib/crm/kst";
import { canAccessTm002, tm002VisibleAssigneeIdsFromStaff } from "@/lib/crm/scope";
import { listTm002Customers } from "@/lib/crm/tm002/store";
import { getSupabaseAdmin } from "@/lib/supabase";

const HEADERS = [
  "제휴사",
  "DB차수",
  "이름",
  "연락처",
  "가입일",
  "flag",
  "레벨",
  "주소",
  "상세주소",
  "담당자",
  "배정일",
  "상담상태",
  "상품",
  "메모",
];

function canExportTm002(rank: string): boolean {
  return rank === "admin" || rank === "tm_admin";
}

/** POST /api/admin/tm002/export */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  if (!canAccessTm002(session) || !canExportTm002(session.rank)) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const query = String(form.get("query") || "");
    const sp = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
    const excludeClosed = String(form.get("exclude_closed_status") || "") === "1";
    let excludePhones = phonesFromText(String(form.get("exclude_phones") || ""));
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      excludePhones = mergePhoneSets(excludePhones, phonesFromWorkbook(Buffer.from(await file.arrayBuffer())));
    }

    const supabase = getSupabaseAdmin();
    const { data: staffRows } = await supabase
      .from("staff_users")
      .select("id, parent_id")
      .eq("is_active", true);
    const scoped = tm002VisibleAssigneeIdsFromStaff(
      session,
      (staffRows ?? []).map((s) => ({
        id: String(s.id),
        parent_id: s.parent_id ? String(s.parent_id) : null,
      }))
    );

    const pageSize = 1000;
    const collected = [];
    for (let offset = 0; offset < 200000; offset += pageSize) {
      const { items, total } = await listTm002Customers({
        q: sp.get("q") || "",
        status: sp.get("status") || "",
        ids: String(sp.get("ids") || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        assigneeId: sp.get("assignee_id") || "",
        unassignedOnly: sp.get("unassigned") === "1",
        assignedDate: sp.get("assigned_date") || "",
        visibleAssigneeIds: scoped,
        limit: pageSize,
        offset,
        includeHistory: false,
      });
      collected.push(...items);
      if (items.length < pageSize || collected.length >= total) break;
    }

    const rows = collected
      .filter((c) => keepExportRow(c, { excludeClosed, excludePhones }))
      .map((c) => [
        c.partner_name,
        c.batch_code,
        c.name,
        c.phone,
        c.joined_at ? formatKstDateTime(new Date(c.joined_at)).slice(0, 10) : "",
        c.flag,
        c.level,
        c.address,
        c.address_detail,
        c.assignee_name ?? "",
        c.assigned_at ? formatKstDateTime(new Date(c.assigned_at)) : "",
        c.status,
        c.product ?? "",
        c.memo ?? "",
      ]);

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(toExcelXml("TM002", HEADERS, rows), {
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="tm002_${stamp}.xls"`,
      },
    });
  } catch (e) {
    console.error("export tm002:", e);
    return NextResponse.json({ ok: false, message: "다운로드 중 오류가 발생했습니다." }, { status: 500 });
  }
}
