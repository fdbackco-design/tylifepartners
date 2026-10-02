import { NextRequest, NextResponse } from "next/server";
import { authenticatePartnerRequest } from "@/lib/partner/auth";
import { partnerError } from "@/lib/partner/errors";
import { logPartnerRequest } from "@/lib/partner/log";
import { isPartnerRateLimited } from "@/lib/partner/rateLimit";
import { assertResourceAllowed } from "@/lib/partner/scope";
import type { PartnerAuthContext, PartnerResource } from "@/lib/partner/types";

export type PartnerHandlerResult = {
  status: number;
  body: Record<string, unknown>;
  errorCode?: string;
};

export async function withPartnerReadApi(
  request: NextRequest,
  resource: PartnerResource,
  path: string,
  run: (ctx: PartnerAuthContext) => Promise<PartnerHandlerResult>
): Promise<NextResponse> {
  const started = Date.now();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = request.headers.get("user-agent");
  const querySummary = request.nextUrl.search.slice(0, 500);

  let keyId: string | null = null;
  let clientId: string | null = null;

  const finish = async (result: PartnerHandlerResult) => {
    void logPartnerRequest({
      keyId,
      clientId,
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

  const auth = await authenticatePartnerRequest(request.headers.get("authorization"));
  if (!auth.ok) {
    if (auth.reason === "not_ready") {
      return finish({
        status: 503,
        body: { code: "internal_error", message: "파트너 API가 아직 준비되지 않았습니다." },
        errorCode: "internal_error",
      });
    }
    const code =
      auth.reason === "missing" || auth.reason === "invalid" || auth.reason === "expired"
        ? "unauthorized"
        : "forbidden";
    return finish({
      status: code === "unauthorized" ? 401 : 403,
      body: { code, message: auth.reason === "expired" ? "키가 만료되었습니다." : undefined },
      errorCode: code,
    });
  }

  keyId = auth.ctx.keyId;
  clientId = auth.ctx.clientId;

  const scope = assertResourceAllowed(auth.ctx.permissions, resource);
  if (!scope.ok) {
    return finish({
      status: scope.code === "scope_not_configured" ? 403 : 403,
      body: { code: scope.code, message: scope.message },
      errorCode: scope.code,
    });
  }

  if (await isPartnerRateLimited(auth.ctx.keyId, auth.ctx.rateLimitPerMinute)) {
    return finish({
      status: 429,
      body: {
        code: "rate_limited",
        message: `분당 최대 ${auth.ctx.rateLimitPerMinute}회까지 호출할 수 있습니다.`,
      },
      errorCode: "rate_limited",
    });
  }

  try {
    const result = await run(auth.ctx);
    return finish(result);
  } catch (e) {
    console.error(`[partner-api] ${path}:`, e);
    return finish({
      status: 500,
      body: { code: "internal_error" },
      errorCode: "internal_error",
    });
  }
}
