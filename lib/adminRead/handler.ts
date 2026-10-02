import { NextRequest, NextResponse } from "next/server";
import { authenticateAdminReadRequest } from "@/lib/adminRead/auth";
import { isPartnerApiKeyFormat, extractBearerToken } from "@/lib/adminRead/crypto";
import { logAdminReadRequest } from "@/lib/adminRead/log";
import { isAdminReadRateLimited } from "@/lib/adminRead/rateLimit";
import { assertAdminReadResource } from "@/lib/adminRead/scope";
import type { AdminReadAuthContext, AdminReadResource } from "@/lib/adminRead/types";

export type AdminReadHandlerResult = {
  status: number;
  body: Record<string, unknown>;
  errorCode?: string;
};

export async function withAdminReadApi(
  request: NextRequest,
  resource: AdminReadResource,
  path: string,
  run: (ctx: AdminReadAuthContext) => Promise<AdminReadHandlerResult>
): Promise<NextResponse> {
  if (request.method !== "GET") {
    return NextResponse.json({ code: "method_not_allowed" }, { status: 405 });
  }

  const started = Date.now();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = request.headers.get("user-agent");
  const querySummary = request.nextUrl.search.slice(0, 500);
  let keyId: string | null = null;

  const finish = async (result: AdminReadHandlerResult) => {
    void logAdminReadRequest({
      keyId,
      method: request.method,
      path,
      statusCode: result.status,
      durationMs: Date.now() - started,
      ip,
      userAgent,
      querySummary,
      errorCode: result.errorCode ?? null,
    });
    return NextResponse.json(result.body, { status: result.status });
  };

  const rawToken = extractBearerToken(request.headers.get("authorization"));
  if (rawToken && isPartnerApiKeyFormat(rawToken)) {
    return finish({
      status: 403,
      body: { code: "forbidden", message: "파트너 API 키로는 관리자 읽기 API를 호출할 수 없습니다." },
      errorCode: "forbidden",
    });
  }

  const auth = await authenticateAdminReadRequest(request.headers.get("authorization"));
  if (!auth.ok) {
    if (auth.reason === "wrong_key_type") {
      return finish({
        status: 403,
        body: { code: "forbidden", message: "파트너 API 키로는 관리자 읽기 API를 호출할 수 없습니다." },
        errorCode: "forbidden",
      });
    }
    if (auth.reason === "not_ready") {
      return finish({
        status: 503,
        body: { code: "internal_error", message: "관리자 읽기 API가 아직 준비되지 않았습니다." },
        errorCode: "internal_error",
      });
    }
    const unauthorized =
      auth.reason === "missing" ||
      auth.reason === "invalid" ||
      auth.reason === "expired" ||
      auth.reason === "revoked";
    return finish({
      status: unauthorized ? 401 : 403,
      body: {
        code: unauthorized ? "unauthorized" : "forbidden",
        message: auth.reason === "expired" ? "키가 만료되었습니다." : undefined,
      },
      errorCode: unauthorized ? "unauthorized" : "forbidden",
    });
  }

  keyId = auth.ctx.keyId;

  const scope = assertAdminReadResource(auth.ctx.permissions, resource);
  if (!scope.ok) {
    return finish({
      status: 403,
      body: { code: scope.code, message: scope.message },
      errorCode: scope.code,
    });
  }

  if (await isAdminReadRateLimited(auth.ctx.keyId, auth.ctx.rateLimitPerMinute)) {
    return finish({
      status: 429,
      body: { code: "rate_limited", message: `분당 최대 ${auth.ctx.rateLimitPerMinute}회까지 호출할 수 있습니다.` },
      errorCode: "rate_limited",
    });
  }

  try {
    return finish(await run(auth.ctx));
  } catch (e) {
    console.error(`[admin-read-api] ${path}:`, e);
    return finish({ status: 500, body: { code: "internal_error" }, errorCode: "internal_error" });
  }
}
