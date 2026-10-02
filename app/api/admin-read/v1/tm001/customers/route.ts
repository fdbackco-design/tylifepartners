import { NextRequest } from "next/server";
import { withAdminReadApi } from "@/lib/adminRead/handler";
import { parseAdminReadPagination } from "@/lib/adminRead/pagination";
import { queryAdminReadTm001 } from "@/lib/adminRead/queryTm001";
import { TM001_STATUSES } from "@/lib/crm/tm001/types";

export async function GET(request: NextRequest) {
  return withAdminReadApi(request, "tm001", "/api/admin-read/v1/tm001/customers", async () => {
    const sp = request.nextUrl.searchParams;
    const { limit, offset } = parseAdminReadPagination(sp);
    const status = sp.get("status")?.trim();
    if (status && !(TM001_STATUSES as readonly string[]).includes(status)) {
      return {
        status: 400,
        body: { code: "invalid_query", message: "status 값이 올바르지 않습니다." },
        errorCode: "invalid_query",
      };
    }

    const assignedDate = sp.get("assigned_date")?.trim();
    if (assignedDate && !/^\d{4}-\d{2}-\d{2}$/.test(assignedDate)) {
      return {
        status: 400,
        body: { code: "invalid_query", message: "assigned_date 형식은 YYYY-MM-DD 입니다." },
        errorCode: "invalid_query",
      };
    }

    const { items, total, stayTotal } = await queryAdminReadTm001(sp, limit, offset);

    return {
      status: 200,
      body: {
        items,
        limit,
        offset,
        total,
        ...(stayTotal != null ? { stay_total: stayTotal } : {}),
        time_zone: "Asia/Seoul",
      },
    };
  });
}
