/** CRM date helpers (KST-oriented display) */

export function formatYmdDot(ymd: string): string {
  if (!ymd || ymd.length < 10) return "";
  return `${ymd.slice(0, 4)}.${ymd.slice(5, 7)}.${ymd.slice(8, 10)}`;
}

export function todayYmdLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysLocal(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function startOfMonthYmd(ymd: string = todayYmdLocal()): string {
  return `${ymd.slice(0, 7)}-01`;
}

export function endOfMonthYmd(ymd: string = todayYmdLocal()): string {
  const [y, m] = ymd.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${ymd.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

export function maskCustomerName(name: string): string {
  const n = String(name ?? "").trim();
  if (n.length <= 1) return n || "-";
  if (n.length === 2) return `${n[0]}*`;
  return `${n[0]}${"*".repeat(Math.min(n.length - 2, 2))}${n[n.length - 1]}`;
}

export function assigneeColor(id: string | null | undefined): string {
  const palette = ["#400293", "#0f766e", "#b45309", "#1d4ed8", "#be123c", "#047857", "#7c3aed", "#0369a1"];
  if (!id) return palette[0];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export function statusClassName(status: string): string {
  const safe = status.replace(/[^\w가-힣]/g, "");
  return `crm-status crm-status-${safe}`;
}
