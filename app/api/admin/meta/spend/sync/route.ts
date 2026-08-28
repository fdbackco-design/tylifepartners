import { NextRequest, NextResponse } from "next/server";
import { requireRank } from "@/lib/adminSession";
import { isMetaAdsConfigured, normalizeMetaAdAccountId } from "@/lib/meta/ads";
import { syncMetaAdDailyInsights } from "@/lib/meta/insights";

/**
 * POST /api/admin/meta/spend/sync
 * 관리자 전용 — Meta Insights 오늘 광고비·리드 동기화
 */
export async function POST(_request: NextRequest) {
  const session = await requireRank("admin");
  if (!session) {
    return NextResponse.json({ ok: false, message: "관리자만 동기화할 수 있습니다." }, { status: 403 });
  }

  if (!isMetaAdsConfigured()) {
    return NextResponse.json(
      { ok: false, message: "META_ACCESS_TOKEN 환경변수가 설정되지 않았습니다." },
      { status: 503 }
    );
  }

  const result = await syncMetaAdDailyInsights();
  return NextResponse.json({
    ok: result.ok,
    insight_date: result.insight_date,
    timezone: result.timezone,
    upserted: result.upserted,
    ad_account_id: normalizeMetaAdAccountId(),
    message: result.message,
  }, { status: result.ok ? 200 : 502 });
}
