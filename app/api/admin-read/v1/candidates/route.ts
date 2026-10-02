import { NextRequest } from "next/server";
import { parseAdminReadPagination } from "@/lib/adminRead/pagination";
import { queryAdminReadCandidates } from "@/lib/adminRead/queryCandidates";
import { withAdminReadApi } from "@/lib/adminRead/handler";
import { LEAD_STATUSES } from "@/lib/crm/types";

export async function GET(request: NextRequest) {
  return withAdminReadApi(request, "candidates", "/api/admin-read/v1/candidates", async () => {
    const sp = request.nextUrl.searchParams;
    const { limit, offset } = parseAdminReadPagination(sp);
    const status = sp.get("status")?.trim();
    if (status && !(LEAD_STATUSES as readonly string[]).includes(status)) {
      return {
        status: 400,
        body: { code: "invalid_query", message: "status 값이 올바르지 않습니다." },
        errorCode: "invalid_query",
      };
    }

    const forced = new URLSearchParams(sp);
    forced.set("category", "candidates");
    forced.set("limit", String(limit));
    forced.set("offset", String(offset));
    if (status) forced.set("statuses", status);

    const { items, total } = await queryAdminReadCandidates(forced);

    return {
      status: 200,
      body: { items, limit, offset, total, time_zone: "Asia/Seoul" },
    };
  });
}
