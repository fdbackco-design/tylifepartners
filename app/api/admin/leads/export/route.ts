import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { toCsv, toExcelXml } from "@/lib/crm/excel";
import { parseLeadQuery, queryLeads } from "@/lib/crm/queryLeads";
import { canExportLeads, canSeeAdminStatus } from "@/lib/crm/scope";

const HEADERS = [
  "유형",
  "신청시간",
  "이름",
  "연락처",
  "유입페이지",
  "지역",
  "상담가능시간",
  "연령대",
  "직업",
  "직급",
  "유입경로",
  "매체",
  "캠페인",
  "소재",
  "키워드",
  "담당자",
  "팀",
  "관리자상태",
  "상담상태",
  "메모",
  "코멘트",
  "마케팅동의",
];

function asciiFilename(label: string, stamp: string, ext: string): string {
  const safe = label.replace(/[^a-zA-Z0-9_-]+/g, "_") || "leads";
  return `tylife_${safe}_${stamp}.${ext}`;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  if (!canExportLeads(session)) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }

  try {
    const q = parseLeadQuery(request.nextUrl.searchParams);
    q.limit = 5000;
    q.offset = 0;
    const { items } = await queryLeads(session, q);
    const showAdmin = canSeeAdminStatus(session);
    const rows = items.map((r) => [
      r.type,
      r.created_at,
      r.name,
      r.phone,
      r.entry_page,
      r.region,
      r.available_time,
      r.age_group,
      r.job,
      r.job_rank,
      r.utm_source,
      r.utm_medium,
      r.utm_campaign,
      r.utm_content,
      r.utm_term,
      r.assignee_name,
      r.team_name,
      showAdmin ? r.admin_status?.label ?? "" : "",
      r.status,
      r.memo,
      r.admin_comment,
      r.marketing_consent ?? "",
    ]);

    const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xls";
    const stamp = new Date().toISOString().slice(0, 10);
    const labelKey = q.needReassign
      ? "need_reassign"
      : q.category === "candidates"
        ? "candidates"
        : q.category === "all"
          ? "all"
          : "consumers";
    const sheetName =
      q.needReassign ? "need_reassign" : q.category === "candidates" ? "candidates" : q.category === "all" ? "all" : "consumers";

    if (format === "csv") {
      return new NextResponse(toCsv(HEADERS, rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${asciiFilename(labelKey, stamp, "csv")}"`,
        },
      });
    }

    return new NextResponse(toExcelXml(sheetName, HEADERS, rows), {
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="${asciiFilename(labelKey, stamp, "xls")}"`,
      },
    });
  } catch (e) {
    console.error("export leads:", e);
    return NextResponse.json({ ok: false, message: "다운로드 중 오류가 발생했습니다." }, { status: 500 });
  }
}
