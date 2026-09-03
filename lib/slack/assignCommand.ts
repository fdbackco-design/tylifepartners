import { changeLeadAssignee } from "@/lib/crm/assignLead";
import { matchStaffByLabel } from "@/lib/crm/excelImport/logic";
import type { LeadCategory, SessionUser } from "@/lib/crm/types";
import { formatPhoneKorean } from "@/lib/phone";
import { normalizePhoneDigits } from "@/lib/phoneBlacklist";
import { getSupabaseAdmin } from "@/lib/supabase";

export type ParsedAssignCommand =
  | { ok: true; leadQuery: string; assigneeQuery: string; category: LeadCategory | "all"; unassign: boolean }
  | { ok: false; message: string };

export type SlackAssignResult = {
  text: string;
  ok: boolean;
};

const HELP = [
  "*사용법* (Slack App 커맨드명: `/setmember`)",
  "`/setmember <고객이름|전화번호> <담당자이름>`",
  "`/setmember <고객이름|전화번호> 미배정`",
  "`/setmember 후보자|소비자 <고객> <담당자>`",
  "",
  "예) `/setmember 김성구 이주희`",
  "예) `/setmember 01086470556 이주희`",
].join("\n");

export function parseAssignCommandText(rawText: string): ParsedAssignCommand {
  const text = String(rawText ?? "").trim();
  if (!text || text === "도움" || text === "help" || text === "?") {
    return { ok: false, message: HELP };
  }

  const tokens = text.split(/\s+/).filter(Boolean);
  let category: LeadCategory | "all" = "all";
  let rest = tokens;

  if (rest[0] === "후보자" || rest[0] === "후보") {
    category = "candidates";
    rest = rest.slice(1);
  } else if (rest[0] === "소비자") {
    category = "consumers";
    rest = rest.slice(1);
  }

  if (rest.length < 2) {
    return { ok: false, message: `인자가 부족합니다.\n\n${HELP}` };
  }

  const assigneeQuery = rest[rest.length - 1];
  const leadQuery = rest.slice(0, -1).join(" ").trim();
  if (!leadQuery) {
    return { ok: false, message: `고객을 지정해 주세요.\n\n${HELP}` };
  }

  const unassign = assigneeQuery === "미배정" || assigneeQuery === "해제";
  return { ok: true, leadQuery, assigneeQuery, category, unassign };
}

type LeadHit = {
  id: string;
  name: string;
  phone: string;
  category: LeadCategory;
  assignee_id: string | null;
};

async function searchTable(
  table: "leads" | "tylife_b2b",
  category: LeadCategory,
  leadQuery: string
): Promise<LeadHit[]> {
  const supabase = getSupabaseAdmin();
  const digits = normalizePhoneDigits(leadQuery);

  let rows: Array<{ id: string; name: string; phone: string; assignee_id: string | null }> = [];

  if (digits.length >= 10) {
    const { data, error } = await supabase
      .from(table)
      .select("id, name, phone, assignee_id")
      .eq("merge_status", "active")
      .eq("normalized_phone", digits)
      .limit(10);
    if (error) {
      console.error("[slack/assign] phone search:", table, error.message);
      return [];
    }
    rows = (data ?? []) as typeof rows;
  } else {
    const { data: exact, error: exactErr } = await supabase
      .from(table)
      .select("id, name, phone, assignee_id")
      .eq("merge_status", "active")
      .eq("name", leadQuery)
      .limit(10);
    if (exactErr) {
      console.error("[slack/assign] name exact:", table, exactErr.message);
    } else {
      rows = (exact ?? []) as typeof rows;
    }
    if (!rows.length) {
      const { data: fuzzy, error: fuzzyErr } = await supabase
        .from(table)
        .select("id, name, phone, assignee_id")
        .eq("merge_status", "active")
        .ilike("name", `%${leadQuery}%`)
        .limit(10);
      if (fuzzyErr) {
        console.error("[slack/assign] name fuzzy:", table, fuzzyErr.message);
        return [];
      }
      rows = (fuzzy ?? []) as typeof rows;
    }
  }

  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    phone: String(r.phone ?? ""),
    category,
    assignee_id: r.assignee_id ? String(r.assignee_id) : null,
  }));
}

export async function findLeadsForAssignCommand(
  leadQuery: string,
  category: LeadCategory | "all"
): Promise<LeadHit[]> {
  const jobs: Array<Promise<LeadHit[]>> = [];
  if (category === "all" || category === "candidates") {
    jobs.push(searchTable("tylife_b2b", "candidates", leadQuery));
  }
  if (category === "all" || category === "consumers") {
    jobs.push(searchTable("leads", "consumers", leadQuery));
  }
  const parts = await Promise.all(jobs);
  return parts.flat();
}

function slackSession(userName: string): SessionUser {
  const label = String(userName || "unknown").trim() || "unknown";
  return {
    rank: "admin",
    userId: null,
    name: `Slack/${label}`,
    loginId: `slack:${label}`,
    region: null,
    parentId: null,
  };
}

function formatHit(h: LeadHit): string {
  const kind = h.category === "candidates" ? "후보자" : "소비자";
  return `• ${kind} ${h.name} · ${formatPhoneKorean(h.phone)}`;
}

/**
 * `/setmember` 슬래시 커맨드 본문 처리
 */
export async function handleAssignSlashCommand(opts: {
  text: string;
  userName: string;
}): Promise<SlackAssignResult> {
  const parsed = parseAssignCommandText(opts.text);
  if (!parsed.ok) {
    return { ok: false, text: parsed.message };
  }

  const hits = await findLeadsForAssignCommand(parsed.leadQuery, parsed.category);
  if (!hits.length) {
    return {
      ok: false,
      text: `고객을 찾지 못했습니다: \`${parsed.leadQuery}\`\n전화번호로 다시 시도해 주세요.`,
    };
  }
  if (hits.length > 1) {
    return {
      ok: false,
      text: [
        `고객이 ${hits.length}건 검색되었습니다. 전화번호로 지정해 주세요.`,
        "",
        ...hits.slice(0, 8).map(formatHit),
      ].join("\n"),
    };
  }

  const lead = hits[0];
  let assigneeId: string | null = null;
  let assigneeName = "미배정";

  if (!parsed.unassign) {
    const supabase = getSupabaseAdmin();
    const { data: staffRows, error } = await supabase
      .from("staff_users")
      .select("id, name")
      .eq("is_active", true);
    if (error) {
      console.error("[slack/assign] staff load:", error.message);
      return { ok: false, text: "담당자 목록을 불러오지 못했습니다." };
    }
    const staff = (staffRows ?? []).map((s) => ({
      id: String(s.id),
      name: String(s.name ?? ""),
    }));
    const matched = matchStaffByLabel(parsed.assigneeQuery, staff);
    if (!matched.staff) {
      return {
        ok: false,
        text: `담당자를 찾지 못했습니다: \`${parsed.assigneeQuery}\``,
      };
    }
    assigneeId = matched.staff.id;
    assigneeName = matched.staff.name;
  }

  const result = await changeLeadAssignee({
    session: slackSession(opts.userName),
    id: lead.id,
    category: lead.category,
    assigneeId,
  });

  if (!result.ok) {
    return { ok: false, text: result.message };
  }

  const kind = lead.category === "candidates" ? "후보자" : "소비자";
  if (parsed.unassign) {
    return {
      ok: true,
      text: `✅ ${kind} *${lead.name}* (${formatPhoneKorean(lead.phone)}) 담당자를 *미배정*으로 변경했습니다.`,
    };
  }
  return {
    ok: true,
    text: `✅ ${kind} *${lead.name}* (${formatPhoneKorean(lead.phone)}) 담당자를 *${assigneeName}*님으로 설정했습니다.`,
  };
}
