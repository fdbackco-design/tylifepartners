import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { toCsv, toExcelXml } from "@/lib/crm/excel";
import {
  keepExportRow,
  mergePhoneSets,
  phonesFromText,
  phonesFromWorkbook,
} from "@/lib/crm/exportExclude";
import { parseLeadQuery, queryLeads } from "@/lib/crm/queryLeads";
import { canExportLeads, canSeeAdminStatus } from "@/lib/crm/scope";
import type { SessionUser } from "@/lib/crm/types";

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
  "맞춤정보동의",
  "전화광고",
  "문자광고",
  "카카오광고",
  "이메일광고",
  "동의버전",
  "동의철회",
  "TM대상",
];

function asciiFilename(label: string, stamp: string, ext: string): string {
  const safe = label.replace(/[^a-zA-Z0-9_-]+/g, "_") || "leads";
  return `tylife_${safe}_${stamp}.${ext}`;
}

async function buildExport(session: SessionUser, requestUrl: string, extra?: { excludeClosed: boolean; excludePhones: Set<string> }) {
  const q = parseLeadQuery(new URL(requestUrl, "http://local").searchParams);
  q.limit = 5000;
  q.offset = 0;
  const { items } = await queryLeads(session, q);
  const filtered = extra
    ? items.filter((r) => keepExportRow(r, { excludeClosed: extra.excludeClosed, excludePhones: extra.excludePhones }))
    : items;
  return { q, items: filtered };
}

function toExportResponse(
  q: ReturnType<typeof parseLeadQuery>,
  items: Awaited<ReturnType<typeof queryLeads>>["items"],
  format: "csv" | "xls",
  showAdmin: boolean
) {
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
    r.consent?.custom_info_consent ? 1 : r.consent ? 0 : "",
    r.consent?.ad_phone_consent ? 1 : r.consent ? 0 : "",
    r.consent?.ad_sms_consent ? 1 : r.consent ? 0 : "",
    r.consent?.ad_kakao_consent ? 1 : r.consent ? 0 : "",
    r.consent?.ad_email_consent ? 1 : r.consent ? 0 : "",
    r.consent?.consent_version ?? "",
    r.consent?.withdrawn_at ?? "",
    r.consent?.tm_eligible ? 1 : r.consent ? 0 : "",
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  const labelKey = q.needReassign
    ? "need_reassign"
    : q.category === "candidates"
      ? "candidates"
      : q.category === "all"
        ? "all"
        : "consumers";
  const sheetName = labelKey;

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
}

async function excludePhonesFromForm(form: FormData): Promise<{ excludeClosed: boolean; excludePhones: Set<string> }> {
  const excludeClosed = String(form.get("exclude_closed_status") || "") === "1";
  let phones = phonesFromText(String(form.get("exclude_phones") || ""));
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    const buf = Buffer.from(await file.arrayBuffer());
    phones = mergePhoneSets(phones, phonesFromWorkbook(buf));
  }
  return { excludeClosed, excludePhones: phones };
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  if (!canExportLeads(session)) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }

  try {
    const { q, items } = await buildExport(session, request.nextUrl.search);
    const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xls";
    return toExportResponse(q, items, format, canSeeAdminStatus(session));
  } catch (e) {
    console.error("export leads:", e);
    return NextResponse.json({ ok: false, message: "다운로드 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/** POST /api/admin/leads/export — 상담상태·제외 전화번호 조건 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  if (!canExportLeads(session)) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const query = String(form.get("query") || "");
    const extra = await excludePhonesFromForm(form);
    const { q, items } = await buildExport(session, query.startsWith("?") ? query : `?${query}`, extra);
    return toExportResponse(q, items, "xls", canSeeAdminStatus(session));
  } catch (e) {
    console.error("export leads post:", e);
    return NextResponse.json({ ok: false, message: "다운로드 중 오류가 발생했습니다." }, { status: 500 });
  }
}
