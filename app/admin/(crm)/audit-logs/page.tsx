"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CrmAlert,
  CrmButton,
  CrmEmptyState,
  CrmInput,
  CrmPageHeader,
  CrmSelect,
  CrmTable,
} from "@/app/admin/_components/crm/ui";

type AuditRow = {
  id: string;
  created_at: string;
  actor_login_id: string;
  actor_name: string;
  actor_rank: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  summary: string;
  detail: Record<string, unknown> | null;
  ip: string | null;
  success: boolean;
};

const ACTION_OPTIONS = [
  { value: "", label: "전체 행동" },
  { value: "login", label: "로그인" },
  { value: "login_failed", label: "로그인 실패" },
  { value: "logout", label: "로그아웃" },
  { value: "lead.update", label: "리드 수정" },
  { value: "lead.bulk_assignee", label: "담당자 일괄 변경" },
  { value: "lead.hide_from_list", label: "db 삭제" },
  { value: "user.create", label: "계정 생성" },
  { value: "user.update", label: "계정 수정" },
  { value: "user.reset_password", label: "비밀번호 초기화" },
  { value: "user.change_password", label: "비밀번호 변경" },
  { value: "assignment.update", label: "자동분배 설정" },
  { value: "assignment.rule_create", label: "자동분배 권역 추가" },
  { value: "assignment.rule_delete", label: "자동분배 권역 삭제" },
  { value: "landing.create", label: "랜딩 생성" },
  { value: "landing.update", label: "랜딩 수정" },
  { value: "landing.delete", label: "랜딩 삭제" },
  { value: "landing.upload", label: "랜딩 업로드" },
  { value: "utm.create", label: "UTM 등록" },
  { value: "utm.update", label: "UTM 수정" },
  { value: "utm.delete", label: "UTM 삭제" },
  { value: "utm.bulk_delete", label: "UTM 일괄 삭제" },
  { value: "blacklist.create", label: "블랙리스트 등록" },
  { value: "blacklist.upsert", label: "블랙리스트 갱신" },
  { value: "blacklist.update", label: "블랙리스트 수정" },
  { value: "blacklist.deactivate", label: "블랙리스트 비활성" },
];

function rankLabel(rank: string) {
  if (rank === "admin") return "관리자";
  if (rank === "manager") return "매니저";
  if (rank === "sales") return "영업자";
  return rank || "-";
}

function formatAction(row: AuditRow): string {
  if (row.action === "lead.hide_from_list") {
    const count =
      typeof row.detail?.hidden_count === "number"
        ? row.detail.hidden_count
        : Array.isArray(row.detail?.names)
          ? row.detail.names.length
          : Array.isArray(row.detail?.items)
            ? row.detail.items.length
            : null;
    return count != null ? `db ${count}건 삭제` : "db 삭제";
  }
  return row.action;
}

function formatSummary(row: AuditRow): string {
  if (row.action === "lead.hide_from_list") {
    const fromDetailNames = Array.isArray(row.detail?.names)
      ? (row.detail.names as unknown[]).map((n) => String(n)).filter(Boolean)
      : [];
    const fromPreview = Array.isArray(row.detail?.names_preview)
      ? (row.detail.names_preview as unknown[]).map((n) => String(n)).filter(Boolean)
      : [];
    const fromItems = Array.isArray(row.detail?.items)
      ? (row.detail.items as Array<{ name?: string }>)
          .map((i) => String(i?.name ?? "").trim())
          .filter(Boolean)
      : [];
    const names = fromDetailNames.length
      ? fromDetailNames
      : fromPreview.length
        ? fromPreview
        : fromItems;
    if (names.length) return names.join(", ");
  }
  return row.summary || "-";
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function AuditLogsPage() {
  const [items, setItems] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const sp = new URLSearchParams();
      sp.set("limit", String(limit));
      sp.set("offset", String(offset));
      if (action) sp.set("action", action);
      if (actor.trim()) sp.set("actor", actor.trim());
      if (q.trim()) sp.set("q", q.trim());
      const res = await fetch(`/api/admin/audit-logs?${sp}`);
      const data = await res.json();
      if (!data.ok) {
        setError(data.message || "조회에 실패했습니다.");
        setItems([]);
        setTotal(0);
        return;
      }
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [action, actor, q, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.floor(offset / limit);

  return (
    <div className="crm-ui-content">
      <CrmPageHeader
        title="활동 로그"
        description="계정별 로그인·수정 이력을 확인합니다. (관리자 전용)"
        actions={
          <CrmButton variant="secondary" onClick={() => void load()}>
            새로고침
          </CrmButton>
        }
      />

      {error ? (
        <div style={{ marginBottom: 12 }}>
          <CrmAlert tone="danger">{error}</CrmAlert>
        </div>
      ) : null}

      <div className="crm-ui-toolbar">
        <CrmSelect
          value={action}
          onChange={(e) => {
            setOffset(0);
            setAction(e.target.value);
          }}
          aria-label="행동 필터"
          style={{ width: 180 }}
        >
          {ACTION_OPTIONS.map((o) => (
            <option key={o.value || "all"} value={o.value}>
              {o.label}
            </option>
          ))}
        </CrmSelect>
        <CrmInput
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          onBlur={() => setOffset(0)}
          placeholder="이름/아이디"
          aria-label="계정 검색"
          style={{ width: 160 }}
        />
        <CrmInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setOffset(0);
              void load();
            }
          }}
          placeholder="내용 검색"
          aria-label="내용 검색"
          style={{ width: 200 }}
        />
        <CrmButton
          variant="primary"
          onClick={() => {
            setOffset(0);
            void load();
          }}
        >
          검색
        </CrmButton>
      </div>

      {loading ? (
        <div className="crm-skeleton" style={{ height: 240 }} />
      ) : items.length === 0 ? (
        <CrmEmptyState title="로그가 없습니다" description="조건에 맞는 활동 이력이 없습니다." />
      ) : (
        <>
          <CrmTable>
            <thead>
              <tr>
                <th>시각</th>
                <th>계정</th>
                <th>직급</th>
                <th>행동</th>
                <th>내용</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} style={{ opacity: row.success ? 1 : 0.75 }}>
                  <td className="crm-cell-nowrap" style={{ fontSize: 12, color: "var(--crm-muted)" }}>
                    {formatTime(row.created_at)}
                  </td>
                  <td className="crm-cell-nowrap">
                    <div style={{ fontWeight: 600 }}>{row.actor_name || "-"}</div>
                    <div style={{ fontSize: 12, color: "var(--crm-muted)" }}>{row.actor_login_id || "-"}</div>
                  </td>
                  <td className="crm-cell-nowrap">{rankLabel(row.actor_rank)}</td>
                  <td className="crm-cell-nowrap" style={{ fontSize: 12 }}>
                    {formatAction(row)}
                    {!row.success ? " · 실패" : ""}
                  </td>
                  <td>
                    <div style={{ whiteSpace: "pre-wrap" }}>{formatSummary(row)}</div>
                  </td>
                  <td className="crm-cell-nowrap" style={{ fontSize: 12, color: "var(--crm-muted)" }}>
                    {row.ip || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </CrmTable>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
            <span style={{ fontSize: 13, color: "var(--crm-muted)" }}>
              총 {total.toLocaleString()}건 · {page + 1}/{pages}페이지
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <CrmButton
                variant="secondary"
                disabled={offset <= 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
              >
                이전
              </CrmButton>
              <CrmButton
                variant="secondary"
                disabled={offset + limit >= total}
                onClick={() => setOffset(offset + limit)}
              >
                다음
              </CrmButton>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
