import { formatYmdDot, todayYmdLocal } from "@/lib/crm/ui";
import type { StaffRank } from "@/lib/crm/types";

export function adminCommentRankLabel(rank: StaffRank): string {
  return rank === "admin" ? "관리자" : "매니저";
}

export function formatAdminCommentPrefix(rank: StaffRank, dateYmd = todayYmdLocal()): string {
  return `[${adminCommentRankLabel(rank)} ${formatYmdDot(dateYmd)}] `;
}

/** 기존 이력 + 이번 세션 초안을 저장용 전체 텍스트로 합칩니다. */
export function buildAdminCommentValue(history: string, draft: string, rank: StaffRank): string {
  const trimmed = draft.trim();
  if (!trimmed) return history.trimEnd();
  const entry = `${formatAdminCommentPrefix(rank)}${trimmed}`;
  const base = history.trimEnd();
  return base ? `${base}\n${entry}` : entry;
}
