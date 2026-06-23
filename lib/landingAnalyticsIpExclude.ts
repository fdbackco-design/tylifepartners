function parseExcludedIpsFromEnv(): Set<string> {
  const raw = process.env.LANDING_ANALYTICS_IP_EXCLUDE;
  if (!raw?.trim()) return new Set();
  const set = new Set<string>();
  for (const part of raw.split(/[,;\n]+/)) {
    const ip = part.trim();
    if (ip) set.add(ip);
  }
  return set;
}

let cached: Set<string> | null = null;

function getExcludedIps(): Set<string> {
  if (!cached) cached = parseExcludedIpsFromEnv();
  return cached;
}

/** 스크롤/히트맵 분석 이벤트 수집 제외 IP */
export function isLandingAnalyticsIpExcluded(ip: string | null | undefined): boolean {
  if (!ip) return false;
  return getExcludedIps().has(ip.trim());
}
