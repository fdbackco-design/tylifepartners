"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatPhoneKorean } from "@/lib/phone";
import {
  CrmAlert,
  CrmBadge,
  CrmButton,
  CrmEmptyState,
  CrmField,
  CrmInput,
  CrmPageHeader,
  CrmSheet,
  CrmTable,
} from "@/app/admin/_components/crm/ui";

type BlacklistItem = {
  id: string;
  name: string;
  phone: string;
  normalized_phone: string;
  memo: string | null;
  is_active: boolean;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

function isValidMobile(digits: string): boolean {
  return /^010\d{8}$/.test(digits);
}

export default function BlacklistPage() {
  const [items, setItems] = useState<BlacklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [memo, setMemo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/blacklist");
      const data = await res.json();
      if (!data.ok) {
        setError(data.message || "목록을 불러오지 못했습니다.");
        setItems([]);
        return;
      }
      setItems(data.items ?? []);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((row) => {
      const hay = `${row.name} ${row.phone} ${row.normalized_phone} ${row.memo ?? ""}`.toLowerCase();
      return hay.includes(q) || formatPhoneKorean(row.normalized_phone).includes(q);
    });
  }, [items, search]);

  const openCreate = () => {
    setName("");
    setPhone("");
    setMemo("");
    setFormError("");
    setSheetOpen(true);
  };

  const submit = async () => {
    setFormError("");
    const digits = phone.replace(/\D/g, "");
    if (!name.trim()) {
      setFormError("고객 이름을 입력해 주세요.");
      return;
    }
    if (!isValidMobile(digits)) {
      setFormError("휴대폰번호는 010-0000-0000 형식이어야 합니다.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/blacklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: digits, memo: memo.trim() || null }),
      });
      const data = await res.json();
      if (!data.ok) {
        setFormError(data.message || "등록에 실패했습니다.");
        return;
      }
      setToast(data.message || "등록되었습니다.");
      setSheetOpen(false);
      await load();
    } catch {
      setFormError("네트워크 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (row: BlacklistItem) => {
    if (!window.confirm(`${row.name} (${row.phone}) 을(를) 블랙리스트에서 해제할까요?`)) return;
    const res = await fetch(`/api/admin/blacklist/${row.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!data.ok) {
      setToast(data.message || "해제에 실패했습니다.");
      return;
    }
    setToast("블랙리스트에서 해제했습니다.");
    await load();
  };

  const reactivate = async (row: BlacklistItem) => {
    const res = await fetch(`/api/admin/blacklist/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: true }),
    });
    const data = await res.json();
    if (!data.ok) {
      setToast(data.message || "재활성화에 실패했습니다.");
      return;
    }
    setToast("다시 활성화했습니다.");
    await load();
  };

  const phoneDigits = phone.replace(/\D/g, "");
  const activeCount = items.filter((i) => i.is_active).length;

  return (
    <div className="crm-ui-content">
      <CrmPageHeader
        title="블랙리스트"
        description="등록된 전화번호로 상담 신청이 오면 소비자·후보자 DB에 저장되지 않습니다. 신청자에게는 성공으로 보입니다."
        actions={
          <CrmButton variant="primary" onClick={openCreate}>
            등록
          </CrmButton>
        }
      />

      {toast ? (
        <div style={{ marginBottom: 12 }}>
          <CrmAlert tone="success">{toast}</CrmAlert>
        </div>
      ) : null}
      {error ? (
        <div style={{ marginBottom: 12 }}>
          <CrmAlert tone="danger">{error}</CrmAlert>
        </div>
      ) : null}

      <div className="crm-ui-toolbar">
        <CrmInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름·전화번호·메모 검색"
          aria-label="블랙리스트 검색"
          style={{ maxWidth: 280 }}
        />
        <span style={{ fontSize: 13, color: "var(--crm-muted)" }}>
          활성 {activeCount} / 전체 {items.length}
        </span>
      </div>

      {loading ? (
        <div className="crm-skeleton" style={{ height: 180 }} />
      ) : items.length === 0 ? (
        <CrmEmptyState
          title="등록된 블랙리스트가 없습니다"
          description="차단할 고객 이름과 전화번호를 등록하세요."
          action={
            <CrmButton variant="primary" onClick={openCreate}>
              첫 등록
            </CrmButton>
          }
        />
      ) : filtered.length === 0 ? (
        <CrmEmptyState title="검색 결과가 없습니다" description="검색어를 바꿔 보세요." />
      ) : (
        <CrmTable>
          <thead>
            <tr>
              <th>이름</th>
              <th>연락처</th>
              <th>메모</th>
              <th>상태</th>
              <th>등록</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                <td style={{ fontWeight: 600 }}>{row.name}</td>
                <td className="crm-cell-nowrap">{row.phone || formatPhoneKorean(row.normalized_phone)}</td>
                <td style={{ maxWidth: 280, whiteSpace: "pre-wrap", fontSize: 13 }}>{row.memo || "—"}</td>
                <td>
                  {row.is_active ? <CrmBadge tone="danger">차단 중</CrmBadge> : <CrmBadge tone="neutral">해제</CrmBadge>}
                </td>
                <td style={{ fontSize: 12, color: "var(--crm-muted)" }}>
                  {row.created_by_name ? `${row.created_by_name} · ` : ""}
                  {new Date(row.created_at).toLocaleString("ko-KR")}
                </td>
                <td>
                  {row.is_active ? (
                    <CrmButton variant="secondary" onClick={() => void deactivate(row)}>
                      해제
                    </CrmButton>
                  ) : (
                    <CrmButton variant="secondary" onClick={() => void reactivate(row)}>
                      재활성화
                    </CrmButton>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </CrmTable>
      )}

      <CrmSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="블랙리스트 등록"
        footer={
          <>
            <CrmButton variant="secondary" onClick={() => setSheetOpen(false)}>
              취소
            </CrmButton>
            <CrmButton variant="primary" disabled={saving} onClick={() => void submit()}>
              {saving ? "등록 중…" : "등록"}
            </CrmButton>
          </>
        }
      >
        <CrmField label="고객 이름" htmlFor="bl-name">
          <CrmInput id="bl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" />
        </CrmField>
        <CrmField
          label="전화번호"
          htmlFor="bl-phone"
          hint="010으로 시작하는 11자리"
          error={phone && !isValidMobile(phoneDigits) ? "형식이 올바르지 않습니다." : undefined}
        >
          <CrmInput
            id="bl-phone"
            value={phone}
            onChange={(e) => setPhone(formatPhoneKorean(e.target.value))}
            placeholder="010-0000-0000"
            inputMode="numeric"
          />
        </CrmField>
        <CrmField label="메모 (선택)" htmlFor="bl-memo">
          <CrmInput id="bl-memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="차단 사유 등" />
        </CrmField>
        <CrmAlert tone="info">같은 번호로 상담 신청 시 소비자·후보자 DB에 나타나지 않습니다.</CrmAlert>
        {formError ? <CrmAlert tone="danger">{formError}</CrmAlert> : null}
      </CrmSheet>
    </div>
  );
}
