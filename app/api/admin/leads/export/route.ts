import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminSession";
import { getSupabaseAdmin } from "@/lib/supabase";

function csvEscape(value: unknown): string {
  const str = value == null ? "" : String(value);
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

function toKstString(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * GET /api/admin/leads/export?category=b2c|b2b&search=
 * 관리자 인증 후 리드 데이터를 CSV로 다운로드
 */
export async function GET(request: NextRequest) {
  const valid = await verifyAdminSession();
  if (!valid) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") === "b2b" ? "b2b" : "b2c";
  const search = searchParams.get("search")?.trim() ?? "";
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "5000", 10), 1), 5000);

  const supabase = getSupabaseAdmin();

  const B2B_SELECT =
    "id, name, phone, created_at, status, memo, entry_page, utm_source, utm_medium, utm_campaign, utm_content, utm_term, marketing_consent, region, available_time, age_group, job, job_rank";
  const B2C_SELECT =
    "id, name, phone, created_at, status, memo, desired_date, desired_time, location, entry_page, utm_source, utm_medium, utm_campaign, utm_content, utm_term, marketing_consent";

  try {
    const applySearch = <T extends { or: (filter: string) => T }>(q: T): T => {
      if (!search) return q;
      const safe = search.replace(/,/g, "");
      const term = `%${safe}%`;
      return q.or(`name.ilike.${term},phone.ilike.${term}`);
    };

    const { data, error } =
      category === "b2b"
        ? await applySearch(
            supabase.from("tylife_b2b").select(B2B_SELECT).order("created_at", { ascending: false }).range(0, limit - 1)
          )
        : await applySearch(
            supabase.from("leads").select(B2C_SELECT).order("created_at", { ascending: false }).range(0, limit - 1)
          );
    if (error) {
      console.error("CSV export query error:", error);
      return NextResponse.json({ ok: false, message: "CSV 생성 중 오류가 발생했습니다." }, { status: 500 });
    }

    const rows = (data ?? []) as any[];

    const headers =
      category === "b2b"
        ? [
            "created_at",
            "name",
            "phone",
            "entry_page",
            "region",
            "available_time",
            "age_group",
            "job",
            "job_rank",
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "utm_content",
            "utm_term",
            "marketing_consent",
            "status",
            "memo",
          ]
        : [
            "created_at",
            "name",
            "phone",
            "entry_page",
            "desired_date",
            "desired_time",
            "location",
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "utm_content",
            "utm_term",
            "marketing_consent",
            "status",
            "memo",
          ];

    const csvLines = [
      headers.map(csvEscape).join(","),
      ...rows.map((r) => {
        if (category === "b2b") {
          return [
            toKstString(r.created_at),
            r.name ?? "",
            r.phone ?? "",
            r.entry_page ?? "",
            r.region ?? "",
            r.available_time ?? "",
            r.age_group ?? "",
            r.job ?? "",
            r.job_rank ?? "",
            r.utm_source ?? "",
            r.utm_medium ?? "",
            r.utm_campaign ?? "",
            r.utm_content ?? "",
            r.utm_term ?? "",
            r.marketing_consent ?? "",
            r.status ?? "대기",
            r.memo ?? "",
          ]
            .map(csvEscape)
            .join(",");
        }

        return [
          toKstString(r.created_at),
          r.name ?? "",
          r.phone ?? "",
          r.entry_page ?? "",
          r.desired_date ?? "",
          r.desired_time ?? "",
          r.location ?? "",
          r.utm_source ?? "",
          r.utm_medium ?? "",
          r.utm_campaign ?? "",
          r.utm_content ?? "",
          r.utm_term ?? "",
          r.marketing_consent ?? "",
          r.status ?? "대기",
          r.memo ?? "",
        ]
          .map(csvEscape)
          .join(",");
      }),
    ];

    const csv = `\uFEFF${csvLines.join("\n")}\n`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tylife_${category}_leads.csv"`,
      },
    });
  } catch (e) {
    console.error("CSV export error:", e);
    return NextResponse.json({ ok: false, message: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

