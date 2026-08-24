import { formatKstDateTime } from "@/lib/crm/kst";

export function appendStatusMemo(memo: string, status: string, at: Date = new Date()): string {
  const line = `[${formatKstDateTime(at)}] ${status}`;
  const base = String(memo ?? "").trimEnd();
  if (!base) return `${line}\n\n`;
  return `${base}\n\n${line}\n\n`;
}
