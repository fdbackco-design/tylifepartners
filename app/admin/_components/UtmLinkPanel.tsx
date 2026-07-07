"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildUtmLink, type UtmSourceRow } from "@/lib/utmSourceMapping";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 15,
};

const cellInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: 13,
  boxSizing: "border-box",
};

const btnSecondary: React.CSSProperties = {
  padding: "8px 12px",
  background: "#fff",
  color: "#495057",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const btnDanger: React.CSSProperties = {
  ...btnSecondary,
  color: "#c92a2a",
  borderColor: "#ffc9c9",
};

function emptyEditForm() {
  return { value: "", label: "", sheetLabel: "" };
}

export default function UtmLinkPanel() {
  const [baseUrl, setBaseUrl] = useState("https://www.tylifepartners.com");
  const [path, setPath] = useState("/0623s");
  const [selectedValue, setSelectedValue] = useState("");
  const [items, setItems] = useState<UtmSourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [actionId, setActionId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [newValue, setNewValue] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newSheetLabel, setNewSheetLabel] = useState("");
  const [search, setSearch] = useState("");

  const showToast = useCallback((msg: string, error?: boolean) => {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 2500);
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/utm-sources");
      const data = await res.json();
      if (data.ok) {
        setItems(data.items ?? []);
        setSelectedValue((prev) => {
          if (prev && (data.items ?? []).some((i: UtmSourceRow) => i.value === prev)) return prev;
          return data.items?.[0]?.value ?? "";
        });
      } else {
        showToast(data.message || "목록을 불러오지 못했습니다.", true);
      }
    } catch {
      showToast("네트워크 오류가 발생했습니다.", true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const generatedLink = useMemo(() => {
    if (!baseUrl.trim() || !selectedValue) return "";
    return buildUtmLink(baseUrl.trim(), path.trim() || "/0623s", selectedValue);
  }, [baseUrl, path, selectedValue]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) || item.value.toLowerCase().includes(q)
    );
  }, [items, search]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/utm-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value: newValue,
          label: newLabel,
          sheet_label: newSheetLabel || newLabel,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setNewValue("");
        setNewLabel("");
        setNewSheetLabel("");
        setSelectedValue(data.item.value);
        await fetchItems();
        showToast("utm_source가 추가되었습니다.");
      } else {
        showToast(data.message || "추가에 실패했습니다.", true);
      }
    } catch {
      showToast("네트워크 오류가 발생했습니다.", true);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: UtmSourceRow) => {
    setEditingId(item.id);
    setEditForm({
      value: item.value,
      label: item.label,
      sheetLabel: item.sheet_label,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(emptyEditForm());
  };

  const handleUpdate = async (e: React.FormEvent, id: string) => {
    e.preventDefault();
    if (actionId) return;
    setActionId(id);
    try {
      const res = await fetch(`/api/admin/utm-sources/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value: editForm.value,
          label: editForm.label,
          sheet_label: editForm.sheetLabel || editForm.label,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSelectedValue(data.item.value);
        cancelEdit();
        await fetchItems();
        showToast("utm_source가 수정되었습니다.");
      } else {
        showToast(data.message || "수정에 실패했습니다.", true);
      }
    } catch {
      showToast("네트워크 오류가 발생했습니다.", true);
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (item: UtmSourceRow) => {
    if (actionId) return;
    const ok = window.confirm(`「${item.label} (${item.value})」 utm_source를 삭제할까요?`);
    if (!ok) return;

    setActionId(item.id);
    try {
      const res = await fetch(`/api/admin/utm-sources/${item.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        if (editingId === item.id) cancelEdit();
        if (selectedValue === item.value) setSelectedValue("");
        await fetchItems();
        showToast("utm_source가 삭제되었습니다.");
      } else {
        showToast(data.message || "삭제에 실패했습니다.", true);
      }
    } catch {
      showToast("네트워크 오류가 발생했습니다.", true);
    } finally {
      setActionId(null);
    }
  };

  const copyLink = async () => {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
      showToast("링크가 복사되었습니다.");
    } catch {
      showToast("복사에 실패했습니다.", true);
    }
  };

  const selectedItem = items.find((i) => i.value === selectedValue);

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 500 }}>사이트 URL</label>
        <input
          type="url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://www.tylifepartners.com"
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 500 }}>경로</label>
        <input
          type="text"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/0623s"
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: 24 }}>
        <label style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 500 }}>utm_source</label>
        {loading ? (
          <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>목록 불러오는 중...</div>
        ) : (
          <select
            value={selectedValue}
            onChange={(e) => setSelectedValue(e.target.value)}
            style={inputStyle}
          >
            {items.length === 0 ? (
              <option value="">등록된 utm_source 없음</option>
            ) : (
              items.map((item) => (
                <option key={item.id} value={item.value}>
                  {item.label} ({item.value})
                </option>
              ))
            )}
          </select>
        )}
        {selectedItem && (
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
            구글 시트 C열(유입매체)·G열(담당자) 표시: <strong>{selectedItem.sheet_label}</strong>
            <span style={{ display: "block", marginTop: 4, fontWeight: 400 }}>
              상담 신청 시 G열에 자동 입력되며 담당자 시트로 동기화됩니다.
            </span>
          </p>
        )}
      </div>

      <div
        style={{
          background: "var(--bg-card)",
          borderRadius: 8,
          padding: 20,
          border: "1px solid var(--border)",
          marginBottom: 28,
        }}
      >
        <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>생성된 UTM 링크</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            readOnly
            value={generatedLink}
            placeholder="utm_source를 선택해 주세요."
            style={{
              flex: 1,
              minWidth: 200,
              padding: "10px 12px",
              fontSize: 14,
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "#f8f9fa",
            }}
          />
          <button
            type="button"
            onClick={copyLink}
            disabled={!generatedLink}
            style={{
              padding: "10px 16px",
              background: generatedLink ? "var(--cta-bg)" : "#adb5bd",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: generatedLink ? "pointer" : "default",
            }}
          >
            복사
          </button>
        </div>
      </div>

      <div
        style={{
          background: "var(--bg-card)",
          borderRadius: 8,
          padding: 20,
          border: "1px solid var(--border)",
          marginBottom: 28,
        }}
      >
        <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>utm_source 추가</h3>
        <form onSubmit={handleAdd}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
              utm_source 값 (URL·DB 저장)
            </label>
            <input
              type="text"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="예: member_id"
              style={inputStyle}
              disabled={saving}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
              표시 이름
            </label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="예: 영업자 이름"
              style={inputStyle}
              disabled={saving}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
              구글 시트 표시명 — C열(유입매체)·G열(담당자)
            </label>
            <input
              type="text"
              value={newSheetLabel}
              onChange={(e) => setNewSheetLabel(e.target.value)}
              placeholder="비우면 표시 이름과 동일"
              style={inputStyle}
              disabled={saving}
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "10px 18px",
              background: saving ? "#adb5bd" : "var(--cta-bg)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: saving ? "default" : "pointer",
            }}
          >
            {saving ? "저장 중..." : "추가하기"}
          </button>
        </form>
      </div>

      <div
        style={{
          background: "var(--bg-card)",
          borderRadius: 8,
          padding: 20,
          border: "1px solid var(--border)",
          marginBottom: 28,
        }}
      >
        <h3 style={{ margin: "0 0 16px", fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
          utm_source 관리
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--cta-bg)",
              background: "rgba(0,0,0,0.04)",
              borderRadius: 999,
              padding: "2px 10px",
            }}
          >
            {items.length}개
          </span>
        </h3>
        {loading ? (
          <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>목록 불러오는 중...</div>
        ) : items.length === 0 ? (
          <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>등록된 utm_source가 없습니다.</div>
        ) : (
          <>
          <div style={{ marginBottom: 14 }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="표시 이름 또는 utm_source 값으로 검색"
              style={inputStyle}
            />
          </div>
          {filteredItems.length === 0 ? (
            <div style={{ fontSize: 14, color: "var(--text-secondary)", padding: "8px 0" }}>
              「{search.trim()}」 검색 결과가 없습니다.
            </div>
          ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14,
                tableLayout: "fixed",
              }}
            >
              <colgroup>
                <col style={{ width: "22%" }} />
                <col style={{ width: "24%" }} />
                <col style={{ width: "26%" }} />
                <col style={{ width: "28%" }} />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)" }}>
                  {["표시 이름", "utm_source 값", "구글 시트 표시명", "관리"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "10px 8px",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--text-secondary)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const editing = editingId === item.id;
                  const busy = actionId === item.id;
                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: editing ? "#f8f9fa" : "transparent",
                      }}
                    >
                      {editing ? (
                        <>
                          <td style={{ padding: "10px 8px", verticalAlign: "top" }}>
                            <input
                              type="text"
                              value={editForm.label}
                              onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))}
                              style={cellInputStyle}
                              disabled={busy}
                            />
                          </td>
                          <td style={{ padding: "10px 8px", verticalAlign: "top" }}>
                            <input
                              type="text"
                              value={editForm.value}
                              onChange={(e) => setEditForm((f) => ({ ...f, value: e.target.value }))}
                              style={cellInputStyle}
                              disabled={busy}
                            />
                          </td>
                          <td style={{ padding: "10px 8px", verticalAlign: "top" }}>
                            <input
                              type="text"
                              value={editForm.sheetLabel}
                              onChange={(e) => setEditForm((f) => ({ ...f, sheetLabel: e.target.value }))}
                              style={cellInputStyle}
                              disabled={busy}
                            />
                          </td>
                          <td style={{ padding: "10px 8px", verticalAlign: "top" }}>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                onClick={(e) => handleUpdate(e, item.id)}
                                disabled={busy}
                                style={{
                                  padding: "6px 12px",
                                  background: busy ? "#adb5bd" : "var(--cta-bg)",
                                  color: "#fff",
                                  border: "none",
                                  borderRadius: 6,
                                  fontSize: 13,
                                  fontWeight: 600,
                                  cursor: busy ? "default" : "pointer",
                                }}
                              >
                                {busy ? "저장 중..." : "저장"}
                              </button>
                              <button type="button" onClick={cancelEdit} style={btnSecondary} disabled={busy}>
                                취소
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ padding: "12px 8px", fontWeight: 600, wordBreak: "break-word" }}>
                            {item.label}
                          </td>
                          <td
                            style={{
                              padding: "12px 8px",
                              color: "var(--text-secondary)",
                              fontFamily: "monospace",
                              wordBreak: "break-word",
                            }}
                          >
                            {item.value}
                          </td>
                          <td
                            style={{
                              padding: "12px 8px",
                              color: "var(--text-secondary)",
                              wordBreak: "break-word",
                            }}
                          >
                            {item.sheet_label}
                          </td>
                          <td style={{ padding: "12px 8px" }}>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                onClick={() => startEdit(item)}
                                style={btnSecondary}
                                disabled={!!actionId}
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(item)}
                                style={btnDanger}
                                disabled={!!actionId}
                              >
                                {busy ? "삭제 중..." : "삭제"}
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
          </>
        )}
      </div>

      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "12px 20px",
            borderRadius: 8,
            background: toast.error ? "#fa5252" : "#212529",
            color: "#fff",
            fontSize: 14,
            zIndex: 300,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

