import { addDaysYmd, kstYmd, startOfKstDayIso, startOfNextKstDayIso } from "@/lib/crm/kst";
import { getTtlCache, setTtlCache } from "@/lib/crm/ttlCache";
import { getMetaAdsAccessToken, isMetaAdsConfigured, normalizeMetaAdAccountId } from "@/lib/meta/ads";
import { getSupabaseAdmin } from "@/lib/supabase";

const GRAPH_VERSION = "v21.0";

/** 동기화 데이터가 이보다 오래되면 백그라운드 재동기화 */
export const META_INSIGHTS_STALE_MS = 45 * 60 * 1000;

export type MetaInsightSyncStatus = "ok" | "error" | "missing" | "pending";

export type MetaAdDailyInsightRow = {
  insight_date: string;
  ad_id: string;
  spend: number;
  lead_count: number;
  cost_per_lead: number | null;
  currency: string | null;
  sync_status: MetaInsightSyncStatus;
  sync_error: string | null;
  synced_at: string;
};

export type TodayDbCostStatus = "ready" | "pending" | "unavailable";

/** 화면 상단 「오늘의 DB 비용」 (어제 광고비 ÷ 어제 DB유입) */
export type TodayDbCost = {
  status: TodayDbCostStatus;
  label: string;
  amount: number | null;
  spend: number | null;
  db_inflow_count: number | null;
  /** 집계에 사용한 날짜(어제, 광고계정 TZ) */
  metrics_date: string | null;
  synced_at: string | null;
};

type GraphResult = { ok: true; data: any } | { ok: false; status: number; message: string };

async function graphGet(path: string, params: Record<string, string>): Promise<GraphResult> {
  const token = getMetaAdsAccessToken();
  if (!token) return { ok: false, status: 0, message: "META_ADS_ACCESS_TOKEN(또는 META_ACCESS_TOKEN) 미설정" };
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(json?.error?.message ?? res.statusText ?? "Meta API error");
    return { ok: false, status: res.status, message: msg };
  }
  return { ok: true, data: json };
}

export function ymdInTimeZone(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }
}

/** YYYY-MM-DD 달력 일수 가감 (타임존 무관) */
export function addCalendarDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** Meta actions[]에서 리드 수 추출 (중복 집계 방지: 우선순위 타입 1개만) */
export function extractLeadCountFromActions(actions: unknown): number {
  if (!Array.isArray(actions)) return 0;
  const map = new Map<string, number>();
  for (const row of actions) {
    if (!row || typeof row !== "object") continue;
    const type = String((row as { action_type?: string }).action_type ?? "");
    const value = Number((row as { value?: string | number }).value ?? 0);
    if (!type || !Number.isFinite(value)) continue;
    map.set(type, value);
  }

  const preferred = [
    "lead",
    "onsite_conversion.lead_grouped",
    "onsite_conversion.lead",
    "offsite_conversion.fb_pixel_lead",
    "omni_complete_registration",
  ];
  for (const key of preferred) {
    if (map.has(key)) return Math.max(0, Math.floor(map.get(key)!));
  }

  let fallback = 0;
  for (const [type, value] of Array.from(map.entries())) {
    if (type === "lead" || type.includes("lead")) {
      fallback = Math.max(fallback, Math.floor(value));
    }
  }
  return Math.max(0, fallback);
}

export function computeCostPerDb(spend: number, dbInflowCount: number): number | null {
  if (!Number.isFinite(spend) || !Number.isFinite(dbInflowCount)) return null;
  if (dbInflowCount <= 0) return null;
  return spend / dbInflowCount;
}

export function formatDbCostWon(amount: number): string {
  const n = Math.round(amount);
  return `${n.toLocaleString("ko-KR")}원`;
}

export function isDaangnUtmSource(utmSource: string | null | undefined): boolean {
  return String(utmSource ?? "").trim().toLowerCase() === "daangn";
}

export function buildTodayDbCost(opts: {
  metricsDate: string;
  spend: number | null;
  dbInflowCount: number | null;
  syncedAt: string | null;
  syncStatus?: MetaInsightSyncStatus | null;
  hasInsightRows: boolean;
}): TodayDbCost {
  const base = {
    spend: opts.spend,
    db_inflow_count: opts.dbInflowCount,
    metrics_date: opts.metricsDate,
    synced_at: opts.syncedAt,
  };

  if (!opts.hasInsightRows || opts.syncStatus === "pending") {
    return { status: "pending", label: "집계 중", amount: null, ...base };
  }
  if (opts.syncStatus === "error" || opts.syncStatus === "missing") {
    return { status: "unavailable", label: "데이터 없음", amount: null, ...base };
  }
  if (opts.spend == null || opts.dbInflowCount == null) {
    return { status: "pending", label: "집계 중", amount: null, ...base };
  }
  const amount = computeCostPerDb(opts.spend, opts.dbInflowCount);
  if (amount == null) {
    return { status: "unavailable", label: "데이터 없음", amount: null, ...base };
  }
  return {
    status: "ready",
    label: formatDbCostWon(amount),
    amount,
    ...base,
  };
}

async function resolveAccountTimezone(accountId: string | null): Promise<{
  timezone: string;
  currency: string | null;
  accountId: string | null;
}> {
  const envTz = String(process.env.META_AD_ACCOUNT_TIMEZONE ?? "").trim();
  const fallbackTz = envTz || "Asia/Seoul";
  if (!accountId) return { timezone: fallbackTz, currency: null, accountId: null };

  const supabase = getSupabaseAdmin();
  const { data: cached } = await supabase
    .from("meta_ad_account_meta")
    .select("timezone_name, currency, updated_at")
    .eq("ad_account_id", accountId)
    .maybeSingle();

  const cachedAt = cached?.updated_at ? new Date(cached.updated_at).getTime() : 0;
  if (cached?.timezone_name && Date.now() - cachedAt < 24 * 60 * 60 * 1000) {
    return {
      timezone: String(cached.timezone_name),
      currency: cached.currency ? String(cached.currency) : null,
      accountId,
    };
  }

  const result = await graphGet(accountId, { fields: "timezone_name,currency" });
  if (!result.ok) {
    if (cached?.timezone_name) {
      return {
        timezone: String(cached.timezone_name),
        currency: cached.currency ? String(cached.currency) : null,
        accountId,
      };
    }
    return { timezone: fallbackTz, currency: null, accountId };
  }

  const timezone = String(result.data?.timezone_name || fallbackTz);
  const currency = result.data?.currency ? String(result.data.currency) : null;
  await supabase.from("meta_ad_account_meta").upsert({
    ad_account_id: accountId,
    timezone_name: timezone,
    currency,
    raw: result.data,
    updated_at: new Date().toISOString(),
  });
  return { timezone, currency, accountId };
}

async function collectCrmMetaAdIds(limit = 2000): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const ids = new Set<string>();
  const [{ data: leads }, { data: b2b }, { data: creatives }] = await Promise.all([
    supabase.from("leads").select("meta_ad_id").not("meta_ad_id", "is", null).limit(limit),
    supabase.from("tylife_b2b").select("meta_ad_id").not("meta_ad_id", "is", null).limit(limit),
    supabase.from("meta_ad_creatives").select("ad_id").limit(limit),
  ]);
  for (const row of [...(leads ?? []), ...(b2b ?? [])]) {
    const id = String((row as { meta_ad_id?: string }).meta_ad_id ?? "").trim();
    if (id) ids.add(id);
  }
  for (const row of creatives ?? []) {
    const id = String((row as { ad_id?: string }).ad_id ?? "").trim();
    if (id) ids.add(id);
  }
  return Array.from(ids);
}

type InsightDatum = { ad_id: string; spend: number; lead_count: number };

async function fetchAccountAdInsights(
  accountId: string,
  insightDate: string
): Promise<{ ok: true; rows: InsightDatum[] } | { ok: false; message: string }> {
  const timeRange = JSON.stringify({ since: insightDate, until: insightDate });
  const rows: InsightDatum[] = [];
  let after: string | undefined;

  for (let page = 0; page < 40; page++) {
    const params: Record<string, string> = {
      level: "ad",
      fields: "ad_id,spend,actions",
      time_range: timeRange,
      limit: "500",
    };
    if (after) params.after = after;

    const result = await graphGet(`${accountId}/insights`, params);
    if (!result.ok) return { ok: false, message: result.message };

    const data = Array.isArray(result.data?.data) ? result.data.data : [];
    for (const item of data) {
      const adId = String(item?.ad_id ?? "").trim();
      if (!adId) continue;
      rows.push({
        ad_id: adId,
        spend: Number(item?.spend ?? 0) || 0,
        lead_count: extractLeadCountFromActions(item?.actions),
      });
    }

    after = result.data?.paging?.cursors?.after;
    if (!after || !result.data?.paging?.next) break;
  }

  return { ok: true, rows };
}

async function fetchPerAdInsights(
  adIds: string[],
  insightDate: string
): Promise<{ rows: InsightDatum[]; errors: Array<{ ad_id: string; message: string }> }> {
  const timeRange = JSON.stringify({ since: insightDate, until: insightDate });
  const rows: InsightDatum[] = [];
  const errors: Array<{ ad_id: string; message: string }> = [];
  const concurrency = 4;

  for (let i = 0; i < adIds.length; i += concurrency) {
    const chunk = adIds.slice(i, i + concurrency);
    const settled = await Promise.all(
      chunk.map(async (adId) => {
        const result = await graphGet(`${adId}/insights`, {
          fields: "ad_id,spend,actions",
          time_range: timeRange,
          limit: "1",
        });
        return { adId, result };
      })
    );

    for (const { adId, result } of settled) {
      if (!result.ok) {
        errors.push({ ad_id: adId, message: result.message });
        continue;
      }
      const item = Array.isArray(result.data?.data) ? result.data.data[0] : null;
      if (!item) {
        rows.push({ ad_id: adId, spend: 0, lead_count: 0 });
        continue;
      }
      rows.push({
        ad_id: adId,
        spend: Number(item?.spend ?? 0) || 0,
        lead_count: extractLeadCountFromActions(item?.actions),
      });
    }
  }

  return { rows, errors };
}

async function upsertInsightRows(
  insightDate: string,
  rows: InsightDatum[],
  opts: { currency: string | null; sync_status?: MetaInsightSyncStatus; sync_error?: string | null }
) {
  if (!rows.length) return;
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const payload = rows.map((r) => ({
    insight_date: insightDate,
    ad_id: r.ad_id,
    spend: r.spend,
    lead_count: r.lead_count,
    cost_per_lead: computeCostPerDb(r.spend, r.lead_count),
    currency: opts.currency,
    sync_status: opts.sync_status ?? "ok",
    sync_error: opts.sync_error ?? null,
    synced_at: now,
    updated_at: now,
  }));

  for (let i = 0; i < payload.length; i += 200) {
    const chunk = payload.slice(i, i + 200);
    const { error } = await supabase.from("meta_ad_daily_insights").upsert(chunk, {
      onConflict: "insight_date,ad_id",
    });
    if (error) throw new Error(error.message);
  }
}

/** 해당 일자(KST) CRM DB 유입 — 소비자+후보자, 당근(daangn) 제외, active만 */
export async function countDbInflowsExcludingDaangn(ymd: string): Promise<number> {
  const start = startOfKstDayIso(ymd);
  const end = startOfNextKstDayIso(ymd);
  const supabase = getSupabaseAdmin();

  const countTable = async (table: "leads" | "tylife_b2b") => {
    const base = () =>
      supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .gte("created_at", start)
        .lt("created_at", end)
        .or("merge_status.eq.active,merge_status.is.null");

    const { count: total, error: totalErr } = await base();
    if (totalErr) {
      console.warn(`[meta/insights] count ${table}:`, totalErr.message);
      return 0;
    }

    // utm_source 가 daangn / 당근 인 건 제외
    const { count: daangn, error: daangnErr } = await base().or(
      "utm_source.ilike.%daangn%,utm_source.ilike.%당근%"
    );
    if (daangnErr) {
      console.warn(`[meta/insights] count daangn ${table}:`, daangnErr.message);
      // 폴백: 정확히 daangn 만 제외
      const { count: exact, error: exactErr } = await base().ilike("utm_source", "daangn");
      if (exactErr) return total ?? 0;
      return Math.max(0, (total ?? 0) - (exact ?? 0));
    }
    return Math.max(0, (total ?? 0) - (daangn ?? 0));
  };

  const [a, b] = await Promise.all([countTable("leads"), countTable("tylife_b2b")]);
  return a + b;
}

/** DB건별 비용 산출에 쓰는 기준일 = 어제(KST) */
export function yesterdayMetricsDateKst(now: Date = new Date()): string {
  return addDaysYmd(kstYmd(now), -1);
}

export async function sumMetaSpendForDate(ymd: string): Promise<{
  spend: number;
  rowCount: number;
  hasError: boolean;
  currency: string | null;
  syncedAt: string | null;
}> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("meta_ad_daily_insights")
    .select("spend, sync_status, currency, synced_at")
    .eq("insight_date", ymd);

  if (error) {
    console.warn("[meta/insights] sum spend:", error.message);
    return { spend: 0, rowCount: 0, hasError: true, currency: null, syncedAt: null };
  }

  const rows = data ?? [];
  let spend = 0;
  let hasError = false;
  let currency: string | null = null;
  let syncedAt: string | null = null;
  for (const row of rows) {
    if (String(row.sync_status) === "error") hasError = true;
    if (String(row.sync_status) === "ok") {
      spend += Number(row.spend) || 0;
    }
    if (!currency && row.currency) currency = String(row.currency);
    const t = row.synced_at ? String(row.synced_at) : null;
    if (t && (!syncedAt || t > syncedAt)) syncedAt = t;
  }
  return { spend, rowCount: rows.length, hasError, currency, syncedAt };
}

async function upsertDailyDbCost(opts: {
  metricsDate: string;
  spend: number;
  dbInflowCount: number;
  currency: string | null;
  syncStatus: MetaInsightSyncStatus;
  syncError?: string | null;
}) {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await supabase.from("meta_daily_db_cost").upsert(
    {
      metrics_date: opts.metricsDate,
      spend: opts.spend,
      db_inflow_count: opts.dbInflowCount,
      cost_per_db: computeCostPerDb(opts.spend, opts.dbInflowCount),
      currency: opts.currency,
      sync_status: opts.syncStatus,
      sync_error: opts.syncError ?? null,
      synced_at: now,
      updated_at: now,
    },
    { onConflict: "metrics_date" }
  );
  if (error) console.warn("[meta/insights] daily db cost upsert:", error.message);
}

export async function recomputeDailyDbCost(metricsDate: string, currency: string | null = null): Promise<void> {
  const spendInfo = await sumMetaSpendForDate(metricsDate);
  const dbInflowCount = await countDbInflowsExcludingDaangn(metricsDate);
  if (!spendInfo.rowCount) {
    await upsertDailyDbCost({
      metricsDate,
      spend: 0,
      dbInflowCount,
      currency,
      syncStatus: "pending",
      syncError: "Insights 미동기화",
    });
    return;
  }
  await upsertDailyDbCost({
    metricsDate,
    spend: spendInfo.spend,
    dbInflowCount,
    currency: spendInfo.currency ?? currency,
    syncStatus: spendInfo.hasError && spendInfo.spend <= 0 ? "error" : "ok",
    syncError: spendInfo.hasError ? "일부 광고 Insights 오류" : null,
  });
}

export type SyncMetaInsightsResult = {
  ok: boolean;
  insight_date: string;
  timezone: string;
  upserted: number;
  message?: string;
};

async function syncInsightsForDate(
  insightDate: string,
  timezone: string,
  currency: string | null,
  accountId: string | null,
  crmAdIds: string[]
): Promise<{ ok: boolean; upserted: number; message?: string }> {
  let rows: InsightDatum[] = [];

  if (accountId) {
    const account = await fetchAccountAdInsights(accountId, insightDate);
    if (!account.ok) return { ok: false, upserted: 0, message: account.message };
    rows = account.rows;
    const seen = new Set(rows.map((r) => r.ad_id));
    for (const adId of crmAdIds) {
      if (!seen.has(adId)) rows.push({ ad_id: adId, spend: 0, lead_count: 0 });
    }
  } else {
    if (!crmAdIds.length) return { ok: true, upserted: 0, message: "동기화할 ad_id 없음" };
    const perAd = await fetchPerAdInsights(crmAdIds, insightDate);
    rows = perAd.rows;
    if (perAd.errors.length) {
      await upsertInsightRows(
        insightDate,
        perAd.errors.map((e) => ({ ad_id: e.ad_id, spend: 0, lead_count: 0 })),
        { currency, sync_status: "error", sync_error: perAd.errors[0]?.message ?? "Meta API error" }
      );
    }
  }

  await upsertInsightRows(insightDate, rows, { currency, sync_status: "ok" });
  await recomputeDailyDbCost(insightDate, currency);
  return { ok: true, upserted: rows.length };
}

/**
 * Meta Insights 동기화 — KST 어제(DB건별 비용용) + 오늘.
 */
export async function syncMetaAdDailyInsights(): Promise<SyncMetaInsightsResult> {
  if (!isMetaAdsConfigured()) {
    return {
      ok: false,
      insight_date: "",
      timezone: "Asia/Seoul",
      upserted: 0,
      message: "META_ADS_ACCESS_TOKEN(또는 META_ACCESS_TOKEN) 미설정",
    };
  }

  const accountId = normalizeMetaAdAccountId();
  const { timezone, currency } = await resolveAccountTimezone(accountId);
  // DB건별 비용 기준일은 항상 KST 어제
  const yesterday = yesterdayMetricsDateKst();
  const today = kstYmd();
  const crmAdIds = await collectCrmMetaAdIds();

  try {
    const y = await syncInsightsForDate(yesterday, timezone, currency, accountId, crmAdIds);
    const t = await syncInsightsForDate(today, timezone, currency, accountId, crmAdIds);
    const ok = y.ok || t.ok;
    return {
      ok,
      insight_date: yesterday,
      timezone: "Asia/Seoul",
      upserted: (y.upserted || 0) + (t.upserted || 0),
      message: y.ok ? t.message : y.message || t.message,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[meta/insights] sync failed:", message);
    return { ok: false, insight_date: yesterday, timezone: "Asia/Seoul", upserted: 0, message };
  }
}

/**
 * 오늘의 DB 비용(건별) = 어제(KST) Meta 광고비 ÷ 어제 CRM DB 유입 건수
 * - 유입: 소비자+후보자, utm_source daangn/당근 제외
 * 호출 측에서 admin 여부 검증 필수.
 */
export async function getTodayDbCost(): Promise<TodayDbCost> {
  const metricsDate = yesterdayMetricsDateKst();

  // 분모는 항상 어제 CRM 실유입을 실시간 집계 (당근 제외)
  const dbInflowCount = await countDbInflowsExcludingDaangn(metricsDate);
  const spendInfo = await sumMetaSpendForDate(metricsDate);

  const stale =
    !spendInfo.rowCount ||
    !spendInfo.syncedAt ||
    Date.now() - new Date(spendInfo.syncedAt).getTime() > META_INSIGHTS_STALE_MS;

  if (stale && isMetaAdsConfigured()) {
    void syncMetaAdDailyInsights().catch((e) => {
      console.warn("[meta/insights] background sync:", e instanceof Error ? e.message : e);
    });
  }

  if (!spendInfo.rowCount) {
    return buildTodayDbCost({
      metricsDate,
      spend: null,
      dbInflowCount,
      syncedAt: null,
      syncStatus: "pending",
      hasInsightRows: false,
    });
  }

  void recomputeDailyDbCost(metricsDate, spendInfo.currency);

  return buildTodayDbCost({
    metricsDate,
    spend: spendInfo.spend,
    dbInflowCount,
    syncedAt: spendInfo.syncedAt,
    syncStatus: spendInfo.hasError && spendInfo.spend <= 0 ? "error" : "ok",
    hasInsightRows: true,
  });
}

const LIST_DB_COST_CACHE_KEY = "meta:today-db-cost-list";
const LIST_DB_COST_TTL_MS = 60_000;
const LIST_DB_COST_STORE_FRESH_MS = 10 * 60 * 1000;

/**
 * 목록 API용 — meta_daily_db_cost 스냅샷 + 짧은 메모리 캐시.
 * 무거운 exact count / 재집계는 백그라운드로만 돌림.
 */
export async function getTodayDbCostForList(): Promise<TodayDbCost> {
  const cached = getTtlCache<TodayDbCost>(LIST_DB_COST_CACHE_KEY);
  if (cached) return cached;

  const metricsDate = yesterdayMetricsDateKst();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("meta_daily_db_cost")
    .select("spend, db_inflow_count, cost_per_db, sync_status, synced_at, updated_at")
    .eq("metrics_date", metricsDate)
    .maybeSingle();

  if (error) {
    console.warn("[meta/insights] list db cost read:", error.message);
  }

  const updatedAt = data?.updated_at ? new Date(String(data.updated_at)).getTime() : 0;
  const storeFresh = updatedAt > 0 && Date.now() - updatedAt < LIST_DB_COST_STORE_FRESH_MS;

  if (data) {
    const value = buildTodayDbCost({
      metricsDate,
      spend: Number(data.spend) || 0,
      dbInflowCount: Number(data.db_inflow_count) || 0,
      syncedAt: data.synced_at ? String(data.synced_at) : null,
      syncStatus: (data.sync_status as MetaInsightSyncStatus) || "ok",
      hasInsightRows: true,
    });
    setTtlCache(LIST_DB_COST_CACHE_KEY, value, LIST_DB_COST_TTL_MS);
    if (!storeFresh) {
      void getTodayDbCost()
        .then((fresh) => setTtlCache(LIST_DB_COST_CACHE_KEY, fresh, LIST_DB_COST_TTL_MS))
        .catch((e) => console.warn("[meta/insights] list bg refresh:", e instanceof Error ? e.message : e));
    }
    return value;
  }

  const pending = buildTodayDbCost({
    metricsDate,
    spend: null,
    dbInflowCount: null,
    syncedAt: null,
    syncStatus: "pending",
    hasInsightRows: false,
  });
  setTtlCache(LIST_DB_COST_CACHE_KEY, pending, Math.min(15_000, LIST_DB_COST_TTL_MS));
  void getTodayDbCost()
    .then((fresh) => setTtlCache(LIST_DB_COST_CACHE_KEY, fresh, LIST_DB_COST_TTL_MS))
    .catch((e) => console.warn("[meta/insights] list bg seed:", e instanceof Error ? e.message : e));
  return pending;
}
