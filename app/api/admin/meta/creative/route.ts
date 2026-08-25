import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminSession";
import { fetchAndCacheMetaAdCreative, isMetaAdsConfigured, pickMetaAdId } from "@/lib/meta/ads";
import { isLikelyMetaObjectId } from "@/lib/utm";

/**
 * POST /api/admin/meta/creative
 * body: { ad_id: string } — 캐시 강제 갱신 후 소재 정보 반환
 */
export async function POST(request: NextRequest) {
  const valid = await verifyAdminSession();
  if (!valid) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const adId = pickMetaAdId({
    meta_ad_id: body.ad_id != null ? String(body.ad_id) : null,
    utm_content: body.utm_content != null ? String(body.utm_content) : null,
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

  const creative = await fetchAndCacheMetaAdCreative(adId);
  return NextResponse.json({
    ok: true,
    configured: true,
    creative: {
      ad_id: creative.ad_id,
      ad_name: creative.ad_name,
      creative_type: creative.creative_type,
      thumbnail_url: creative.thumbnail_url || creative.image_url,
      fetch_status: creative.fetch_status,
      fetch_error: creative.fetch_error,
    },
  });
}
