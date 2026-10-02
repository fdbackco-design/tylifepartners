import type { SessionUser } from "@/lib/crm/types";

/** 외부 admin-read API는 CRM admin과 동일한 전체 데이터 스코프 */
export const ADMIN_READ_SESSION: SessionUser = {
  rank: "admin",
  userId: null,
  name: "Admin Read API",
  loginId: "admin-read-api",
  region: null,
  parentId: null,
};
