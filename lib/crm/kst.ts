const KST = "Asia/Seoul";

export function formatKstDateTime(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}`;
}

export function kstYmd(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function parseKstYmd(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+09:00`);
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = parseKstYmd(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return kstYmd(d);
}

export function calendarDaysInclusive(fromIso: string, toDate: Date = new Date()): number {
  const a = kstYmd(new Date(fromIso));
  const b = kstYmd(toDate);
  const diff = Math.round((parseKstYmd(b).getTime() - parseKstYmd(a).getTime()) / 86400000);
  return Math.max(1, diff + 1);
}

export function startOfKstDayIso(ymd: string): string {
  return parseKstYmd(ymd).toISOString();
}

export function startOfNextKstDayIso(ymd: string): string {
  return parseKstYmd(addDaysYmd(ymd, 1)).toISOString();
}

/** ISO → datetime-local 값 (KST, 시 단위·분 00) */
export function toKstHourLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}T${map.hour}:00`;
}

/** datetime-local(KST 시각) → ISO. 분은 항상 00 */
export function fromKstHourLocalInput(local: string | null | undefined): string | null {
  const v = String(local ?? "").trim();
  if (!v) return null;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, ymd, hh] = m;
  return new Date(`${ymd}T${hh}:00:00+09:00`).toISOString();
}
