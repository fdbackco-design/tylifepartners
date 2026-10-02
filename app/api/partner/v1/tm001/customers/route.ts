import { NextRequest } from "next/server";
import { TM001_STATUSES } from "@/lib/crm/tm001/types";
import { withPartnerReadApi } from "@/lib/partner/handler";
import { parsePartnerPagination } from "@/lib/partner/pagination";
import { queryPartnerTm001Customers } from "@/lib/partner/queryTm001";

export async function GET(request: NextRequest) {
  return withPartnerReadApi(request, "tm001", "/api/partner/v1/tm001/customers", async (ctx) => {
    const { limit, offset } = parsePartnerPagination(request.nextUrl.searchParams);
    const status = request.nextUrl.searchParams.get("status")?.trim();
    if (status && !(TM001_STATUSES as readonly string[]).includes(status)) {
      return {
        status: 400,
        body: { code: "invalid_query", message: "status 값이 올바르지 않습니다." },
        errorCode: "invalid_query",
      };
    }

    const assignedDate = request.nextUrl.searchParams.get("assigned_date")?.trim();
    if (assignedDate && !/^\d{4}-\d{2}-\d{2}$/.test(assignedDate)) {
      return {
        status: 400,
        body: { code: "invalid_query", message: "assigned_date 형식은 YYYY-MM-DD 입니다." },
        errorCode: "invalid_query",
      };
    }

    const { items, total } = await queryPartnerTm001Customers(
      ctx.permissions,
      request.nextUrl.searchParams,
      limit,
      offset
    );

    return {
      status: 200,
      body: { items, limit, offset, total, time_zone: "Asia/Seoul" },
    };
  });
}
