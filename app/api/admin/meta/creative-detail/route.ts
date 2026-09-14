import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminSession";
import {
  getMetaCreativeViewer,
  isMetaAdsConfigured,
  pickMetaAdId,
} from "@/lib/meta/ads";
import { isLikelyMetaObjectId } from "@/lib/utm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/meta/creative-detail?ad_id=…
 * 클릭 확대용 — 이미지 / 카드뉴스 슬라이드 / 영상 소스 메타
 */
export async function GET(request: NextRequest) {
  const valid = await verifyAdminSession();
  if (!valid) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }

  const adId = pickMetaAdId({
    meta_ad_id: request.nextUrl.searchParams.get("ad_id"),
    utm_content: request.nextUrl.searchParams.get("utm_content"),
  });
  if (!adId || !isLikelyMetaObjectId(adId)) {
    return NextResponse.json({ ok: false, message: "유효한 Meta ad_id가 필요합니다." }, { status: 400 });
  }

  if (!isMetaAdsConfigured()) {
    return NextResponse.json(
      { ok: false, message: "META_ACCESS_TOKEN 환경변수가 설정되지 않았습니다." },
      { status: 503 }
    );
  }

  try {
    const viewer = await getMetaCreativeViewer(adId);
    return NextResponse.json({ ok: true, viewer });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("GET /api/admin/meta/creative-detail:", msg);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
