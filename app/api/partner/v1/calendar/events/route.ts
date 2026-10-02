import { NextRequest } from "next/server";
import { kstYmd } from "@/lib/crm/kst";
import { withPartnerReadApi } from "@/lib/partner/handler";
import { queryPartnerCalendarEvents } from "@/lib/partner/queryCalendar";

export async function GET(request: NextRequest) {
  return withPartnerReadApi(request, "calendar", "/api/partner/v1/calendar/events", async (ctx) => {
    const month = request.nextUrl.searchParams.get("month")?.trim() || kstYmd().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return {
        status: 400,
        body: { code: "invalid_query", message: "month 형식은 YYYY-MM 입니다." },
        errorCode: "invalid_query",
      };
    }

    const items = await queryPartnerCalendarEvents(ctx.permissions, month);

    return {
      status: 200,
      body: {
        month,
        time_zone: "Asia/Seoul",
        items,
      },
    };
  });
}
