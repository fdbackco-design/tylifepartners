"use client";

import { useState } from "react";
import {
  CrmAlert,
  CrmBadge,
  CrmButton,
  CrmEmptyState,
  CrmPageHeader,
} from "@/app/admin/_components/crm/ui";

type RowPreview = {
  excel_row_number: number;
  excel_name: string;
  excel_phone: string;
  normalized_phone: string;
  excel_inbound_date: string | null;
  status: string;
  reasons: string[];
  primary_lead_id: string | null;
  lead_table: string | null;
  assignment_to_apply: number[];
  assignment_to_skip: Array<{ step: number; reason: string }>;
  memo_to_apply: number[];
  memo_to_skip: Array<{ step: number; reason: string }>;
  unknown_assignees: string[];
  last_assignee_name: string | null;
};

export default function ExcelAssigneeImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState("");
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);
  const [executeJobId, setExecuteJobId] = useState<string | null>(null);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [rows, setRows] = useState<RowPreview[]>([]);
  const [executeSummary, setExecuteSummary] = useState<Record<string, number> | null>(null);

  const runPreview = async () => {
    if (!file) {
      setError("엑셀 파일을 선택해 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setExecuteJobId(null);
    setExecuteSummary(null);
    try {
      const fd = new FormData();
      fd.set("mode", "preview");
      fd.set("file", file);
      const res = await fetch("/api/admin/leads/excel-import", { method: "POST", body: fd });
      const text = await res.text();
      let data: { ok?: boolean; message?: string; job_id?: string; summary?: Record<string, number>; rows?: RowPreview[] };
      try {
        data = JSON.parse(text);
      } catch {
        setError(
          res.ok
            ? "미리보기 응답을 해석하지 못했습니다."
            : `미리보기 실패 (HTTP ${res.status}). 파일이 크면 서버 타임아웃일 수 있습니다.`
        );
        return;
      }
      if (!res.ok || !data.ok) {
        setError(data.message || "미리보기 실패");
        return;
      }
      setPreviewJobId(data.job_id ?? null);
      setSummary(data.summary ?? null);
      setRows(data.rows ?? []);
    } catch {
      setError("네트워크 오류 (요청이 끊겼거나 시간이 초과되었습니다). 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  const runExecute = async () => {
    if (!file) return;
    if (!window.confirm("미리보기를 확인했습니다. 대표 고객에 담당자 이력·메모를 반영할까요?")) return;
    setExecuting(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("mode", "execute");
      fd.set("confirm", "true");
      fd.set("file", file);
      const res = await fetch("/api/admin/leads/excel-import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || "적용 실패");
        return;
      }
      setExecuteJobId(data.job_id);
      setExecuteSummary(data.summary);
      setRows(
        (data.rows ?? []).map((r: Record<string, string>) => ({
          excel_row_number: Number(r.엑셀행),
          excel_name: String(r.고객명 ?? ""),
          excel_phone: String(r.연락처 ?? ""),
          normalized_phone: String(r.연락처 ?? ""),
          excel_inbound_date: (r.유입일 as string) || null,
          status: String(r.상태 ?? ""),
          reasons: String(r.사유 ?? "")
            .split(" | ")
            .filter(Boolean),
          primary_lead_id: (r.대표고객ID as string) || null,
          lead_table: (r.테이블 as string) || null,
          assignment_to_apply: String(r.담당이력적용차수 || "")
            .split(",")
            .filter(Boolean)
            .map(Number),
          assignment_to_skip: [],
          memo_to_apply: String(r.메모적용차수 || "")
            .split(",")
            .filter(Boolean)
            .map(Number),
          memo_to_skip: [],
          unknown_assignees: [],
          last_assignee_name: null,
        }))
      );
      setSummary(data.summary);
    } catch {
      setError("네트워크 오류");
    } finally {
      setExecuting(false);
    }
  };

  const downloadResult = async () => {
    const jobId = executeJobId || previewJobId;
    if (!jobId || !file) return;
    const fd = new FormData();
    fd.set("mode", "result_file");
    fd.set("job_id", jobId);
    fd.set("file", file);
    const res = await fetch("/api/admin/leads/excel-import", { method: "POST", body: fd });
    if (!res.ok) {
      setError("결과 파일 다운로드 실패");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `excel-import-result.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tone = (status: string) =>
    status === "success" || status === "ready"
      ? "success"
      : status === "warning"
        ? "warning"
        : status === "skipped"
          ? "neutral"
          : "danger";

  return (
    <div className="crm-ui-content">
      <CrmPageHeader
        title="엑셀 담당자·메모 이관"
        description="beforeDB 형식 엑셀의 1~7차 담당자/메모를 정규화 전화번호 기준 대표 고객에 반영합니다. 미리보기 후 승인하세요."
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              aria-label="엑셀 파일"
            />
            <CrmButton variant="secondary" disabled={loading || !file} onClick={() => void runPreview()}>
              {loading ? "미리보기…" : "dry-run 미리보기"}
            </CrmButton>
            <CrmButton
              variant="primary"
              disabled={!summary || executing || !file}
              onClick={() => void runExecute()}
            >
              {executing ? "적용 중…" : "승인 후 적용"}
            </CrmButton>
            <CrmButton
              variant="ghost"
              disabled={!executeJobId && !previewJobId}
              onClick={() => void downloadResult()}
            >
              결과 엑셀 다운로드
            </CrmButton>
          </div>
        }
      />

      {error ? <CrmAlert tone="danger">{error}</CrmAlert> : null}
      {executeSummary ? (
        <CrmAlert tone="success">
          적용 완료 (job {executeJobId}): 성공 {executeSummary.success} / 경고 {executeSummary.warning} /
          실패 {executeSummary.failed} / 스킵 {executeSummary.skipped}
        </CrmAlert>
      ) : null}

      {!summary ? (
        <CrmEmptyState
          title="엑셀을 업로드해 미리보세요"
          description="마이그레이션 023(excel assignee/memo import)이 적용되어 있어야 실제 반영이 됩니다. 담당자명은 staff_users 이름과 매칭됩니다(대표/팀장/레벨업 접미사 정규화)."
        />
      ) : (
        <>
          <div className="crm-ui-stats" style={{ marginBottom: 16 }}>
            {Object.entries(summary).map(([k, v]) => (
              <div key={k} className="crm-ui-stat">
                <div className="crm-ui-stat-value">{v}</div>
                <div className="crm-ui-stat-label">{k}</div>
              </div>
            ))}
          </div>
          <div className="crm-ui-table-shell">
            <table className="crm-ui-table">
              <thead>
                <tr>
                  <th>행</th>
                  <th>상태</th>
                  <th>고객</th>
                  <th>대표 고객</th>
                  <th>담당 이력</th>
                  <th>메모</th>
                  <th>사유</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.excel_row_number}>
                    <td className="crm-cell-nowrap">{r.excel_row_number}</td>
                    <td>
                      <CrmBadge tone={tone(r.status) as "success" | "warning" | "neutral" | "danger"}>
                        {r.status}
                      </CrmBadge>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.excel_name}</div>
                      <div className="crm-ui-hint">
                        {r.normalized_phone || r.excel_phone} · {r.excel_inbound_date || "-"}
                      </div>
                    </td>
                    <td className="crm-ui-hint">
                      {r.primary_lead_id ? `${r.lead_table} / ${r.primary_lead_id.slice(0, 8)}…` : "—"}
                      {r.last_assignee_name ? <div>현재→ {r.last_assignee_name}</div> : null}
                    </td>
                    <td className="crm-ui-hint">
                      적용 [{r.assignment_to_apply.join(", ") || "-"}]
                      {r.assignment_to_skip?.length ? (
                        <div>스킵 {r.assignment_to_skip.map((s) => s.step).join(", ")}</div>
                      ) : null}
                      {r.unknown_assignees?.length ? (
                        <div>미매칭 {r.unknown_assignees.join(", ")}</div>
                      ) : null}
                    </td>
                    <td className="crm-ui-hint">적용 [{r.memo_to_apply.join(", ") || "-"}]</td>
                    <td className="crm-ui-hint">{r.reasons?.slice(0, 4).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
