import { tryAutoAssignLead } from "@/lib/crm/assignment";
import {
  candidateInsertFromCsvRow,
  parseMetaLeadCsv,
  type MetaLeadCsvParseIssue,
  type MetaLeadCsvRow,
} from "@/lib/crm/metaLeadCsv";
import { isLeadSubmissionBlockedAsync, maskPhoneForLog } from "@/lib/phoneBlacklist";
import { getSupabaseAdmin } from "@/lib/supabase";

export type MetaLeadCsvPreviewRow = {
  rowNumber: number;
  meta_lead_id: string;
  name: string;
  phone: string;
  phone_masked: string;
  region: string | null;
  available_time: string | null;
  age_group: string | null;
  job: string | null;
  job_rank: string | null;
  form_name: string | null;
  created_time: string | null;
  action: "insert" | "update" | "skip_blocked" | "skip_invalid";
  existing_id: string | null;
  reason?: string;
};

export type MetaLeadCsvImportSummary = {
  total_parsed: number;
  to_insert: number;
  to_update: number;
  skipped: number;
  issues: number;
};

function summarize(preview: MetaLeadCsvPreviewRow[], issues: MetaLeadCsvParseIssue[]): MetaLeadCsvImportSummary {
  return {
    total_parsed: preview.length,
    to_insert: preview.filter((r) => r.action === "insert").length,
    to_update: preview.filter((r) => r.action === "update").length,
    skipped: preview.filter((r) => r.action === "skip_blocked" || r.action === "skip_invalid").length,
    issues: issues.length,
  };
}

export async function previewMetaLeadCsvImport(buffer: Buffer): Promise<{
  ok: true;
  headers: string[];
  summary: MetaLeadCsvImportSummary;
  rows: MetaLeadCsvPreviewRow[];
  issues: MetaLeadCsvParseIssue[];
} | { ok: false; message: string }> {
  const parsed = parseMetaLeadCsv(buffer);
  if (!parsed.rows.length && parsed.issues.length) {
    const first = parsed.issues[0]?.message || "파싱 실패";
    return { ok: false, message: first };
  }

  const supabase = getSupabaseAdmin();
  const leadIds = parsed.rows.map((r) => r.meta_lead_id).filter(Boolean);
  const existingByMeta = new Map<string, string>();
  if (leadIds.length) {
    // PostgREST in() 길이 제한 대비 청크
    for (let i = 0; i < leadIds.length; i += 200) {
      const chunk = leadIds.slice(i, i + 200);
      const { data, error } = await supabase
        .from("tylife_b2b")
        .select("id, meta_lead_id")
        .in("meta_lead_id", chunk);
      if (error) {
        if (/meta_lead_id|schema cache|column/i.test(error.message)) {
          return {
            ok: false,
            message: `후보자 테이블에 meta_lead_id 컬럼이 없습니다. 마이그레이션 040을 적용해 주세요. (${error.message})`,
          };
        }
        return { ok: false, message: error.message };
      }
      for (const row of data ?? []) {
        if (row.meta_lead_id) existingByMeta.set(String(row.meta_lead_id), String(row.id));
      }
    }
  }

  const preview: MetaLeadCsvPreviewRow[] = [];
  for (const row of parsed.rows) {
    const blocked = await isLeadSubmissionBlockedAsync(row.phone);
    if (blocked) {
      preview.push({
        rowNumber: row.rowNumber,
        meta_lead_id: row.meta_lead_id,
        name: row.name,
        phone: row.phone,
        phone_masked: maskPhoneForLog(row.phone),
        region: row.region,
        available_time: row.available_time,
        age_group: row.age_group,
        job: row.job,
        job_rank: row.job_rank,
        form_name: row.form_name,
        created_time: row.created_time,
        action: "skip_blocked",
        existing_id: null,
        reason: "블랙리스트",
      });
      continue;
    }
    const existingId = existingByMeta.get(row.meta_lead_id) ?? null;
    preview.push({
      rowNumber: row.rowNumber,
      meta_lead_id: row.meta_lead_id,
      name: row.name,
      phone: row.phone,
      phone_masked: maskPhoneForLog(row.phone),
      region: row.region,
      available_time: row.available_time,
      age_group: row.age_group,
      job: row.job,
      job_rank: row.job_rank,
      form_name: row.form_name,
      created_time: row.created_time,
      action: existingId ? "update" : "insert",
      existing_id: existingId,
    });
  }

  return {
    ok: true,
    headers: parsed.headers,
    summary: summarize(preview, parsed.issues),
    rows: preview,
    issues: parsed.issues,
  };
}

export async function executeMetaLeadCsvImport(buffer: Buffer): Promise<{
  ok: true;
  summary: MetaLeadCsvImportSummary & { inserted: number; updated: number; failed: number };
  rows: MetaLeadCsvPreviewRow[];
  issues: MetaLeadCsvParseIssue[];
  errors: string[];
} | { ok: false; message: string }> {
  const preview = await previewMetaLeadCsvImport(buffer);
  if (!preview.ok) return preview;

  const parsed = parseMetaLeadCsv(buffer);
  const byLeadId = new Map<string, MetaLeadCsvRow>();
  for (const r of parsed.rows) byLeadId.set(r.meta_lead_id, r);

  const supabase = getSupabaseAdmin();
  let inserted = 0;
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];
  const resultRows: MetaLeadCsvPreviewRow[] = [];

  for (const row of preview.rows) {
    if (row.action === "skip_blocked" || row.action === "skip_invalid") {
      resultRows.push(row);
      continue;
    }
    const src = byLeadId.get(row.meta_lead_id);
    if (!src) {
      failed += 1;
      errors.push(`${row.rowNumber}: 원본 행을 찾지 못함`);
      continue;
    }

    const payload = candidateInsertFromCsvRow(src);
    try {
      if (row.action === "update" && row.existing_id) {
        const { created_at: _c, status: _s, status_changed_at: _sc, merge_status: _m, ...updatePayload } =
          payload as Record<string, unknown>;
        const { error } = await supabase.from("tylife_b2b").update(updatePayload).eq("id", row.existing_id);
        if (error) {
          failed += 1;
          errors.push(`${row.rowNumber}: ${error.message}`);
          resultRows.push({ ...row, reason: error.message });
          continue;
        }
        updated += 1;
        resultRows.push(row);
        continue;
      }

      const { data, error } = await supabase.from("tylife_b2b").insert(payload).select("id").single();
      if (error) {
        if (/duplicate|unique|meta_lead_id/i.test(error.message)) {
          const { data: again } = await supabase
            .from("tylife_b2b")
            .select("id")
            .eq("meta_lead_id", src.meta_lead_id)
            .maybeSingle();
          if (again?.id) {
            const { created_at: _c, status: _s, status_changed_at: _sc, merge_status: _m, ...updatePayload } =
              payload as Record<string, unknown>;
            await supabase.from("tylife_b2b").update(updatePayload).eq("id", again.id);
            updated += 1;
            resultRows.push({ ...row, action: "update", existing_id: String(again.id) });
            continue;
          }
        }
        failed += 1;
        errors.push(`${row.rowNumber}: ${error.message}`);
        resultRows.push({ ...row, reason: error.message });
        continue;
      }

      inserted += 1;
      const leadId = String(data.id);
      resultRows.push({ ...row, existing_id: leadId });
      try {
        await tryAutoAssignLead({
          table: "tylife_b2b",
          leadId,
          region: src.region,
          utmSource: "meta",
        });
      } catch (e) {
        console.warn("[meta-lead-csv] auto-assign:", e instanceof Error ? e.message : e);
      }
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${row.rowNumber}: ${msg}`);
      resultRows.push({ ...row, reason: msg });
    }
  }

  return {
    ok: true,
    summary: {
      ...preview.summary,
      inserted,
      updated,
      failed,
    },
    rows: resultRows,
    issues: preview.issues,
    errors,
  };
}
