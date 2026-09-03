import { normalizeMetaPhone } from "@/lib/meta/leadAds";
import { resolveRegionZone } from "@/lib/crm/regionZones";

export type MetaLeadCsvRow = {
  rowNumber: number;
  meta_lead_id: string;
  created_time: string | null;
  ad_id: string | null;
  adset_id: string | null;
  campaign_id: string | null;
  form_id: string | null;
  form_name: string | null;
  platform: string | null;
  region: string | null;
  available_time: string | null;
  age_group: string | null;
  job: string | null;
  job_rank: string | null;
  name: string;
  phone: string;
  email: string | null;
  lead_status: string | null;
};

export type MetaLeadCsvParseIssue = {
  rowNumber: number;
  message: string;
  rawName?: string;
  rawPhone?: string;
};

export type MetaLeadCsvParseResult = {
  rows: MetaLeadCsvRow[];
  issues: MetaLeadCsvParseIssue[];
  headers: string[];
};

const JOB_RANK_MAP: Record<string, string> = {
  지점장_이상: "지점장 이상",
  "지점장 이상": "지점장 이상",
  팀장_이상: "팀장 이상",
  "팀장 이상": "팀장 이상",
  fc: "FC",
  FC: "FC",
};

function stripMetaPrefix(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  // Meta CSV: l:123, ag:123, as:123, c:123, f:123
  const m = s.match(/^[a-z]{1,3}:(.+)$/i);
  return m ? m[1].trim() : s;
}

function normalizeHeader(h: string): string {
  return String(h ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function detectDelimiter(sampleLine: string): "\t" | "," {
  const tabs = (sampleLine.match(/\t/g) ?? []).length;
  const commas = (sampleLine.match(/,/g) ?? []).length;
  return tabs >= commas ? "\t" : ",";
}

function decodeCsvBuffer(buf: Buffer): string {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString("utf16le");
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    // utf-16 BE → swap
    const swapped = Buffer.alloc(buf.length - 2);
    for (let i = 2; i + 1 < buf.length; i += 2) {
      swapped[i - 2] = buf[i + 1];
      swapped[i - 1] = buf[i];
    }
    return swapped.toString("utf16le");
  }
  // utf-8 BOM
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.toString("utf8");
  }
  return buf.toString("utf8");
}

function parseLine(line: string, delimiter: "\t" | ","): string[] {
  if (delimiter === "\t") {
    return line.split("\t").map((c) => c.replace(/^"|"$/g, "").trim());
  }
  // simple CSV (Meta export는 보통 TSV; 콤마 대비)
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function mapJobRank(raw: string): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return JOB_RANK_MAP[s] ?? JOB_RANK_MAP[s.replace(/\s+/g, "_")] ?? (s.includes("팀장") ? "팀장 이상" : s.includes("지점장") ? "지점장 이상" : s.toUpperCase() === "FC" ? "FC" : null);
}

export { mapJobRank as mapMetaLeadJobRank };

/**
 * Meta Ads Manager Lead CSV/TSV (utf-16 탭 구분 포함) → 후보자 매핑 행
 */
export function parseMetaLeadCsv(buffer: Buffer): MetaLeadCsvParseResult {
  const text = decodeCsvBuffer(buffer).replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { rows: [], issues: [{ rowNumber: 0, message: "데이터 행이 없습니다." }], headers: [] };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseLine(lines[0], delimiter);
  const normHeaders = headers.map(normalizeHeader);
  const idx = (candidates: string[]) => {
    for (const c of candidates) {
      const i = normHeaders.indexOf(normalizeHeader(c));
      if (i >= 0) return i;
    }
    return -1;
  };

  const col = {
    id: idx(["id", "lead_id", "leadgen_id"]),
    created_time: idx(["created_time", "created time", "created"]),
    ad_id: idx(["ad_id"]),
    adset_id: idx(["adset_id"]),
    campaign_id: idx(["campaign_id"]),
    form_id: idx(["form_id"]),
    form_name: idx(["form_name"]),
    platform: idx(["platform"]),
    region: idx(["지역", "region", "city"]),
    available_time: idx(["상담가능시간", "available_time", "desired_time"]),
    age_group: idx(["연령대", "age_group", "age"]),
    job: idx(["직업", "job"]),
    job_rank: idx(["직급", "job_rank"]),
    name: idx(["이름", "full_name", "name"]),
    phone_number: idx(["phone_number", "phone"]),
    phone_kr: idx(["전화번호", "연락처", "휴대폰"]),
    email: idx(["email", "이메일"]),
    lead_status: idx(["lead_status"]),
  };

  if (col.name < 0 || (col.phone_number < 0 && col.phone_kr < 0)) {
    return {
      rows: [],
      issues: [
        {
          rowNumber: 0,
          message: "필수 컬럼(이름, phone_number/전화번호)을 찾지 못했습니다. Meta Lead CSV인지 확인해 주세요.",
        },
      ],
      headers,
    };
  }

  const rows: MetaLeadCsvRow[] = [];
  const issues: MetaLeadCsvParseIssue[] = [];

  for (let li = 1; li < lines.length; li += 1) {
    const rowNumber = li + 1;
    const cells = parseLine(lines[li], delimiter);
    const get = (i: number) => (i >= 0 && i < cells.length ? String(cells[i] ?? "").trim() : "");

    const rawName = get(col.name);
    const rawPhone = get(col.phone_number) || get(col.phone_kr);
    const name = rawName.replace(/\s+/g, " ").trim();
    const phone = normalizeMetaPhone(rawPhone.replace(/^p:/i, ""));

    const metaLeadId = stripMetaPrefix(get(col.id));
    if (!metaLeadId && !name && !phone) continue;

    if (!name || name.length < 2) {
      issues.push({ rowNumber, message: "이름이 없거나 너무 짧습니다.", rawName, rawPhone });
      continue;
    }
    if (phone.length < 10 || phone.length > 11) {
      issues.push({ rowNumber, message: "연락처가 유효하지 않습니다.", rawName, rawPhone });
      continue;
    }

    rows.push({
      rowNumber,
      meta_lead_id: metaLeadId || `csv-${phone}-${name}`,
      created_time: get(col.created_time) || null,
      ad_id: stripMetaPrefix(get(col.ad_id)) || null,
      adset_id: stripMetaPrefix(get(col.adset_id)) || null,
      campaign_id: stripMetaPrefix(get(col.campaign_id)) || null,
      form_id: stripMetaPrefix(get(col.form_id)) || null,
      form_name: get(col.form_name) || null,
      platform: get(col.platform) || null,
      region: get(col.region) || null,
      available_time: get(col.available_time) || null,
      age_group: get(col.age_group) || null,
      job: get(col.job) || null,
      job_rank: mapJobRank(get(col.job_rank)),
      name: name.length > 40 ? name.slice(0, 40) : name,
      phone,
      email: get(col.email) || null,
      lead_status: get(col.lead_status) || null,
    });
  }

  return { rows, issues, headers };
}

export function metaCreatedTimeIso(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function candidateInsertFromCsvRow(row: MetaLeadCsvRow): Record<string, unknown> {
  const metaCreated = metaCreatedTimeIso(row.created_time);
  const nowIso = new Date().toISOString();
  const regionRaw = row.region;
  const payload: Record<string, unknown> = {
    name: row.name,
    phone: row.phone,
    normalized_phone: row.phone,
    email: row.email,
    source: "meta",
    utm_source: "meta",
    utm_medium: "lead_ads",
    utm_campaign: row.campaign_id,
    utm_content: row.ad_id,
    utm_term: row.platform,
    meta_lead_id: row.meta_lead_id,
    meta_form_id: row.form_id,
    meta_ad_id: row.ad_id,
    meta_adset_id: row.adset_id,
    meta_campaign_id: row.campaign_id,
    meta_created_time: metaCreated,
    entry_page: row.form_name ? `/meta-lead-ads/${row.form_name}` : "/meta-lead-ads",
    region: regionRaw,
    region_zone: resolveRegionZone(regionRaw),
    available_time: row.available_time,
    age_group: row.age_group,
    job: row.job,
    job_rank: row.job_rank,
    status: "배정전",
    status_changed_at: nowIso,
    merge_status: "active",
    marketing_consent: 1,
  };
  if (metaCreated) payload.created_at = metaCreated;
  return payload;
}
