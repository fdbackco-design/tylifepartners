"use client";

import { useCallback, useState } from "react";
import {
  CrmAlert,
  CrmBadge,
  CrmButton,
  CrmEmptyState,
  CrmPageHeader,
  CrmSelect,
} from "@/app/admin/_components/crm/ui";

type Preview = {
  lead_table: string;
  group_count: number;
  mergeable_group_count: number;
  review_group_count: number;
  mergeable_lead_count: number;
  review_lead_count: number;
  schema_notes: string[];
  groups: Array<{
    normalized_phone: string;
    auto_merge: boolean;
    skip_reasons: string[];
    distinct_names: string[];
    primary: { id: string; name: string; created_at: string };
    primary_selection_reason: string;
    sources: Array<{ id: string; name: string; created_at: string }>;
    related: Record<string, number>;
    conflicts: string[];
    memo_blocks_to_add: number;
    assignment_logs_to_move: number;
  }>;
};

export default function LeadMergePage() {
  const [table, setTable] = useState<"leads" | "tylife_b2b">("leads");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError("");
    setResult("");
    setPreview(null);
    try {
      const res = await fetch(`/api/admin/leads/merge?table=${table}`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || "미리보기 실패");
        return;
      }
      setPreview(data.preview);
      setPreviewJobId(data.job_id);
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [table]);

  const runMerge = async () => {
    if (!preview) {
      setError("먼저 미리보기를 실행해 주세요.");
      return;
    }
    if (
      !window.confirm(
        `자동 병합 가능 ${preview.mergeable_group_count}개 그룹을 실제로 병합할까요?\n물리 삭제는 하지 않으며 merged 상태로 보존됩니다.`
      )
    ) {
      return;
    }
    setExecuting(true);
    setError("");
    setResult("");
    try {
      const res = await fetch("/api/admin/leads/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table,
          confirm: true,
          preview_job_id: previewJobId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || "병합 실패");
        return;
      }
      setResult(
        `작업 ${data.job_id}: 성공 ${data.success_count} / 실패 ${data.failed_count} / 검토스킵 ${data.skipped_count}`
      );
      await loadPreview();
    } catch {
      setError("네트워크 오류");
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="crm-ui-content">
      <CrmPageHeader
        title="중복 고객 병합"
        description="정규화 전화번호 기준 중복을 미리보고, 승인 후 자동 병합합니다. 병합된 원본은 삭제되지 않습니다."
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <CrmSelect
              value={table}
              onChange={(e) => {
                setTable(e.target.value as "leads" | "tylife_b2b");
                setPreview(null);
                setPreviewJobId(null);
              }}
              aria-label="테이블"
              style={{ width: 160 }}
            >
              <option value="leads">소비자 (leads)</option>
              <option value="tylife_b2b">후보자 (tylife_b2b)</option>
            </CrmSelect>
            <CrmButton variant="secondary" onClick={() => void loadPreview()} disabled={loading}>
              {loading ? "미리보기…" : "dry-run 미리보기"}
            </CrmButton>
            <CrmButton
              variant="primary"
              onClick={() => void runMerge()}
              disabled={!preview || executing || (preview.mergeable_group_count === 0)}
            >
              {executing ? "병합 중…" : "승인 후 자동 병합 실행"}
            </CrmButton>
          </div>
        }
      />

      {error ? <CrmAlert tone="danger">{error}</CrmAlert> : null}
      {result ? <CrmAlert tone="success">{result}</CrmAlert> : null}

      {!preview && !loading ? (
        <CrmEmptyState
          title="미리보기를 실행하세요"
          description="실제 데이터는 변경되지 않습니다. 마이그레이션 022(lead_merge)가 적용되어 있어야 합니다."
        />
      ) : null}

      {preview ? (
        <>
          <div className="crm-ui-stats" style={{ marginBottom: 16 }}>
            <div className="crm-ui-stat">
              <div className="crm-ui-stat-value">{preview.group_count}</div>
              <div className="crm-ui-stat-label">중복 그룹</div>
            </div>
            <div className="crm-ui-stat">
              <div className="crm-ui-stat-value">{preview.mergeable_group_count}</div>
              <div className="crm-ui-stat-label">자동 병합 가능</div>
            </div>
            <div className="crm-ui-stat">
              <div className="crm-ui-stat-value">{preview.review_group_count}</div>
              <div className="crm-ui-stat-label">검토 대상</div>
            </div>
            <div className="crm-ui-stat">
              <div className="crm-ui-stat-value">{preview.mergeable_lead_count}</div>
              <div className="crm-ui-stat-label">병합될 원본 수</div>
            </div>
          </div>

          <div className="crm-ui-panel" style={{ marginBottom: 16 }}>
            <h2 className="crm-ui-section-title">스키마 참고</h2>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--crm-muted)" }}>
              {preview.schema_notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>

          <div className="crm-ui-table-shell">
            <table className="crm-ui-table">
              <thead>
                <tr>
                  <th>전화(정규화)</th>
                  <th>판정</th>
                  <th>대표</th>
                  <th>원본</th>
                  <th>이력/메모</th>
                  <th>사유·충돌</th>
                </tr>
              </thead>
              <tbody>
                {preview.groups.map((g) => (
                  <tr key={g.normalized_phone}>
                    <td className="crm-cell-nowrap">{g.normalized_phone}</td>
                    <td>
                      {g.auto_merge ? (
                        <CrmBadge tone="success">자동 병합</CrmBadge>
                      ) : (
                        <CrmBadge tone="warning">검토</CrmBadge>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{g.primary.name}</div>
                      <div className="crm-ui-hint">{g.primary.id.slice(0, 8)}…</div>
                      <div className="crm-ui-hint">{g.primary_selection_reason}</div>
                    </td>
                    <td>
                      {g.sources.map((s) => (
                        <div key={s.id} className="crm-ui-hint">
                          {s.name} ({s.id.slice(0, 8)}…)
                        </div>
                      ))}
                    </td>
                    <td className="crm-ui-hint">
                      담당이력 {g.assignment_logs_to_move} · 메모블록 {g.memo_blocks_to_add}
                      <br />
                      배정이력 {g.related.assignment_logs} / 메모로그 {g.related.memo_logs} / 상태{" "}
                      {g.related.status_logs}
                    </td>
                    <td className="crm-ui-hint">
                      {g.skip_reasons.length ? g.skip_reasons.join(", ") : "—"}
                      {g.conflicts.map((c) => (
                        <div key={c}>{c}</div>
                      ))}
                      {g.distinct_names.length > 1 ? (
                        <div>이름: {g.distinct_names.join(" / ")}</div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.groups.length === 0 ? (
              <div className="crm-empty" style={{ border: "none" }}>
                중복 그룹이 없습니다.
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
