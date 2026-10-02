import { NextRequest } from "next/server";
import { withPartnerReadApi } from "@/lib/partner/handler";
import { parsePartnerPagination } from "@/lib/partner/pagination";
import { queryPartnerCandidates } from "@/lib/partner/queryCandidates";
import { LEAD_STATUSES } from "@/lib/crm/types";

export async function GET(request: NextRequest) {
  return withPartnerReadApi(request, "candidates", "/api/partner/v1/candidates", async (ctx) => {
    const { limit, offset } = parsePartnerPagination(request.nextUrl.searchParams);
    const status = request.nextUrl.searchParams.get("status")?.trim();
    if (status && !(LEAD_STATUSES as readonly string[]).includes(status)) {
      return {
        status: 400,
        body: { code: "invalid_query", message: "status 값이 올바르지 않습니다." },
        errorCode: "invalid_query",
      };
    }

    const { items, total } = await queryPartnerCandidates(
      ctx.permissions,
      request.nextUrl.searchParams,
      limit,
      offset
    );

    return {
      status: 200,
      body: {
        items,
        limit,
        offset,
        total,
        time_zone: "Asia/Seoul",
      },
    };
  });
}
