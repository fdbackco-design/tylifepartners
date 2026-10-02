import type { AdminReadPermissions, AdminReadResource } from "@/lib/adminRead/types";

export function assertAdminReadResource(
  p: AdminReadPermissions,
  resource: AdminReadResource
): { ok: true } | { ok: false; code: "forbidden"; message: string } {
  if (resource === "candidates" && !p.allow_candidates) {
    return { ok: false, code: "forbidden", message: "이 키는 후보자 조회가 허용되지 않습니다." };
  }
  if (resource === "tm001" && !p.allow_tm001) {
    return { ok: false, code: "forbidden", message: "이 키는 TM001 조회가 허용되지 않습니다." };
  }
  if (resource === "tm002" && !p.allow_tm002) {
    return { ok: false, code: "forbidden", message: "이 키는 TM002 조회가 허용되지 않습니다." };
  }
  if (resource === "calendar" && !p.allow_calendar) {
    return { ok: false, code: "forbidden", message: "이 키는 캘린더 조회가 허용되지 않습니다." };
  }
  return { ok: true };
}
