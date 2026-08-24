/** 배정 로그 → 시간순 담당자 이름 체인 (순수 함수) */
export function buildAssigneeNameChain(
  logs: Array<{
    from_assignee_id: string | null;
    to_assignee_id: string | null;
    assigned_at: string;
  }>,
  nameOf: (id: string | null | undefined) => string
): string[] {
  const sorted = [...logs].sort((a, b) =>
    String(a.assigned_at) < String(b.assigned_at) ? -1 : String(a.assigned_at) > String(b.assigned_at) ? 1 : 0
  );
  const chain: string[] = [];
  for (const log of sorted) {
    const from = nameOf(log.from_assignee_id);
    const to = nameOf(log.to_assignee_id);
    if (chain.length === 0 && from) chain.push(from);
    if (to && (chain.length === 0 || chain[chain.length - 1] !== to)) chain.push(to);
  }
  return chain;
}

export function formatAssigneeWithTeam(name: string, teamName?: string | null): string {
  const n = (name || "").trim();
  const t = (teamName || "").trim();
  if (!n) return "미배정";
  if (t && t !== n) return `${n}(${t})`;
  return n;
}
