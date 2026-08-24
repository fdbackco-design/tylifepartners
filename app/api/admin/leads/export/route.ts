import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { toCsv, toExcelXml } from "@/lib/crm/excel";
import { parseLeadQuery, queryLeads } from "@/lib/crm/queryLeads";
import { canSeeAdminStatus } from "@/lib/crm/scope";

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
  "마케팅동의",
];

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });

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
      r.marketing_consent ?? "",
    ]);

    const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xls";
    const stamp = new Date().toISOString().slice(0, 10);
    const label = q.recontact ? "재컨택" : q.category === "candidates" ? "후보자" : "소비자";

    if (format === "csv") {
      return new NextResponse(toCsv(HEADERS, rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="tylife_${label}_${stamp}.csv"`,
        },
      });
    }

    return new NextResponse(toExcelXml(label, HEADERS, rows), {
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="tylife_${label}_${stamp}.xls"`,
      },
    });
  } catch (e) {
    console.error("export leads:", e);
    return NextResponse.json({ ok: false, message: "다운로드 중 오류가 발생했습니다." }, { status: 500 });
  }
}
