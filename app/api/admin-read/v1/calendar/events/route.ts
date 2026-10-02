import { NextRequest } from "next/server";
import { withAdminReadApi } from "@/lib/adminRead/handler";
import { queryAdminReadCalendar } from "@/lib/adminRead/queryCalendar";
import { kstYmd } from "@/lib/crm/kst";

export async function GET(request: NextRequest) {
  return withAdminReadApi(request, "calendar", "/api/admin-read/v1/calendar/events", async () => {
    const sp = request.nextUrl.searchParams;
    const month = sp.get("month")?.trim() || kstYmd().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return {
        status: 400,
        body: { code: "invalid_query", message: "month 형식은 YYYY-MM 입니다." },
        errorCode: "invalid_query",
      };
    }

    const types = sp.get("types")?.trim() || "";
    const items = await queryAdminReadCalendar(month, types);

    return {
      status: 200,
      body: { month, time_zone: "Asia/Seoul", items },
    };
  });
}
