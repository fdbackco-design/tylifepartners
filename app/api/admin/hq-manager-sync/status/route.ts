import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminSession";
import {
  getHqManagerSyncSecret,
  getHqManagerSyncWebAppUrl,
  isHqManagerSyncConfigured,
} from "@/lib/hqManagerSync/config";

/**
 * GET /api/admin/hq-manager-sync/status
 * 시크릿 값은 노출하지 않고 설정 상태만 확인
 */
export async function GET() {
  const valid = await verifyAdminSession();
  if (!valid) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }

  const url = getHqManagerSyncWebAppUrl();
  const secret = getHqManagerSyncSecret();

  let urlHost: string | null = null;
  let urlEndsWithExec = false;
  if (url) {
    try {
      const parsed = new URL(url);
      urlHost = parsed.host;
      urlEndsWithExec = parsed.pathname.endsWith("/exec");
    } catch {
      urlHost = "invalid-url";
    }
  }

  const secretAsciiOnly = secret ? /^[\x20-\x7E]+$/.test(secret) : false;

  return NextResponse.json({
    ok: true,
    configured: isHqManagerSyncConfigured(),
    urlHost,
    urlEndsWithExec,
    urlHasDev: url?.includes("/dev") ?? false,
    secretLength: secret?.length ?? 0,
    secretAsciiOnly,
    hint:
      "UNAUTHORIZED 시 Apps Script → 프로젝트 설정 → 스크립트 속성에 HQ_MANAGER_SYNC_SECRET 값이 서버 env와 동일한지 확인하세요.",
  });
}
