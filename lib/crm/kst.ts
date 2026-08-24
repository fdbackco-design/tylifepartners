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
