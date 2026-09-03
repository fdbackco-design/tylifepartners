"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CrmAlert,
  CrmBadge,
  CrmButton,
  CrmEmptyState,
  CrmPageHeader,
} from "@/app/admin/_components/crm/ui";

type PreviewRow = {
  rowNumber: number;
  meta_lead_id: string;
  name: string;
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

type Summary = {
  total_parsed: number;
  to_insert: number;
  to_update: number;
  skipped: number;
  issues: number;
  inserted?: number;
  updated?: number;
  failed?: number;
};

export default function MetaLeadImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [issues, setIssues] = useState<Array<{ rowNumber: number; message: string }>>([]);
  const [executed, setExecuted] = useState(false);

  const runPreview = async () => {
    if (!file) {
      setError("Meta Lead CSV 파일을 선택해 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setExecuted(false);
    try {
      const fd = new FormData();
      fd.set("mode", "preview");
      fd.set("file", file);
      const res = await fetch("/api/admin/leads/meta-lead-import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || "미리보기 실패");
        setRows([]);
        setSummary(null);
        return;
      }
      setSummary(data.summary ?? null);
      setRows(data.rows ?? []);
      setIssues(data.issues ?? []);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const runExecute = async () => {
    if (!file) return;
    if (!window.confirm("미리보기를 확인했습니다. 후보자 DB에 반영할까요?")) return;
    setExecuting(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("mode", "execute");
      fd.set("confirm", "true");
      fd.set("file", file);
      const res = await fetch("/api/admin/leads/meta-lead-import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || "반영 실패");
        return;
      }
      setSummary(data.summary ?? null);
      setRows(data.rows ?? []);
      setIssues(data.issues ?? []);
      setExecuted(true);
      if (Array.isArray(data.errors) && data.errors.length) {
        setError(`일부 실패: ${data.errors.slice(0, 3).join(" / ")}`);
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setExecuting(false);
    }
  };

  const actionLabel = (a: PreviewRow["action"]) => {
    if (a === "insert") return "신규";
    if (a === "update") return "갱신";
    if (a === "skip_blocked") return "차단";
    return "건너뜀";
  };

  return (
    <div>
      <CrmPageHeader
        title="Meta Lead CSV → 후보자 DB"
        description="Meta Ads Manager에서 받은 Lead CSV(utf-16/탭 구분 포함)를 후보자 DB에 올립니다. 웹훅 자동화 전 수동 반영용입니다."
      />

      <div className="crm-toolbar" style={{ marginTop: 16 }}>
        <input
          type="file"
          accept=".csv,text/csv,text/tab-separated-values"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setExecuted(false);
            setSummary(null);
            setRows([]);
            setIssues([]);
            setError("");
          }}
        />
        <CrmButton type="button" variant="secondary" disabled={loading || !file} onClick={() => void runPreview()}>
          {loading ? "분석 중…" : "미리보기"}
        </CrmButton>
        <CrmButton
          type="button"
          disabled={executing || !file || !summary || executed}
          onClick={() => void runExecute()}
        >
          {executing ? "반영 중…" : "후보자 DB에 반영"}
        </CrmButton>
        <Link href="/admin/candidates" className="crm-btn">
          후보자 DB 보기
        </Link>
      </div>

      {error ? (
        <div style={{ marginTop: 12 }}>
          <CrmAlert tone="danger">{error}</CrmAlert>
        </div>
      ) : null}

      {summary ? (
        <div className="crm-dash-stats" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <CrmBadge>파싱 {summary.total_parsed}</CrmBadge>
            <CrmBadge>신규 {summary.inserted ?? summary.to_insert}</CrmBadge>
            <CrmBadge>갱신 {summary.updated ?? summary.to_update}</CrmBadge>
            <CrmBadge>건너뜀 {summary.skipped}</CrmBadge>
            {typeof summary.failed === "number" ? <CrmBadge>실패 {summary.failed}</CrmBadge> : null}
            <CrmBadge>이슈 {summary.issues}</CrmBadge>
            {executed ? <CrmBadge>반영 완료</CrmBadge> : null}
          </div>
        </div>
      ) : null}

      {issues.length > 0 ? (
        <div style={{ marginTop: 12, fontSize: 13, color: "var(--crm-muted)" }}>
          파싱 이슈 {issues.length}건 — 예: {issues[0].rowNumber}행 {issues[0].message}
        </div>
      ) : null}

      {!rows.length && !loading ? (
        <CrmEmptyState
          title="CSV를 선택해 미리보기를 실행하세요"
          description="예: 설계사모집_카드뉴스_Leads_….csv (Meta 내보내기)"
        />
      ) : (
        <div className="crm-table-shell" style={{ marginTop: 16 }}>
          <table className="crm-table">
            <thead>
              <tr>
                <th>행</th>
                <th>동작</th>
                <th>이름</th>
                <th>연락처</th>
                <th>지역</th>
                <th>시간</th>
                <th>연령</th>
                <th>직업/직급</th>
                <th>폼</th>
                <th>meta_lead_id</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.rowNumber}-${r.meta_lead_id}`}>
                  <td>{r.rowNumber}</td>
                  <td>
                    <CrmBadge>{actionLabel(r.action)}</CrmBadge>
                    {r.reason ? <div style={{ fontSize: 11, color: "var(--crm-muted)" }}>{r.reason}</div> : null}
                  </td>
                  <td>{r.name}</td>
                  <td>{r.phone_masked}</td>
                  <td>{r.region || "—"}</td>
                  <td>{r.available_time || "—"}</td>
                  <td>{r.age_group || "—"}</td>
                  <td>
                    {[r.job, r.job_rank].filter(Boolean).join(" / ") || "—"}
                  </td>
                  <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.form_name || "—"}
                  </td>
                  <td style={{ fontSize: 11 }}>{r.meta_lead_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
