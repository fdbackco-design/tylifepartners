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
            구글 시트 C·G열 표시: <strong>{selectedItem.sheet_label}</strong>
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
        <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>utm_source 관리</h3>
        {loading ? (
          <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>목록 불러오는 중...</div>
        ) : items.length === 0 ? (
          <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>등록된 utm_source가 없습니다.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 14,
                  background: editingId === item.id ? "#f8f9fa" : "#fff",
                }}
              >
                {editingId === item.id ? (
                  <form onSubmit={(e) => handleUpdate(e, item.id)}>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 500 }}>
                        utm_source 값
                      </label>
                      <input
                        type="text"
                        value={editForm.value}
                        onChange={(e) => setEditForm((f) => ({ ...f, value: e.target.value }))}
                        style={inputStyle}
                        disabled={actionId === item.id}
                      />
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 500 }}>
                        표시 이름
                      </label>
                      <input
                        type="text"
                        value={editForm.label}
                        onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))}
                        style={inputStyle}
                        disabled={actionId === item.id}
                      />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 500 }}>
                        구글 시트 표시명
                      </label>
                      <input
                        type="text"
                        value={editForm.sheetLabel}
                        onChange={(e) => setEditForm((f) => ({ ...f, sheetLabel: e.target.value }))}
                        style={inputStyle}
                        disabled={actionId === item.id}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="submit"
                        disabled={actionId === item.id}
                        style={{
                          padding: "8px 14px",
                          background: actionId === item.id ? "#adb5bd" : "var(--cta-bg)",
                          color: "#fff",
                          border: "none",
                          borderRadius: 6,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: actionId === item.id ? "default" : "pointer",
                        }}
                      >
                        {actionId === item.id ? "저장 중..." : "저장"}
                      </button>
                      <button type="button" onClick={cancelEdit} style={btnSecondary} disabled={actionId === item.id}>
                        취소
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                      {item.label}{" "}
                      <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>({item.value})</span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>
                      시트 표시: {item.sheet_label}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" onClick={() => startEdit(item)} style={btnSecondary} disabled={!!actionId}>
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        style={btnDanger}
                        disabled={!!actionId}
                      >
                        {actionId === item.id ? "삭제 중..." : "삭제"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          background: "var(--bg-card)",
          borderRadius: 8,
          padding: 20,
          border: "1px solid var(--border)",
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
              placeholder="예: instagram_reel"
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
              placeholder="예: 인스타 릴스"
              style={inputStyle}
              disabled={saving}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
              구글 시트 표시명 (C·G열, 선택)
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
