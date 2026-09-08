"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CrmAlert,
  CrmBadge,
  CrmButton,
  CrmEmptyState,
  CrmField,
  CrmInput,
  CrmPageHeader,
  CrmSheet,
} from "@/app/admin/_components/crm/ui";
import { formatBytes, type ResourcePostRow } from "@/lib/crm/resourceShares";

type PendingFile = {
  storage_path: string;
  public_url: string | null;
  original_filename: string;
  content_type: string | null;
  size_bytes: number;
};

async function uploadResourceFile(file: File): Promise<PendingFile> {
  const prep = await fetch("/api/admin/resources/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      size: file.size,
    }),
  });
  const prepJson = await prep.json();
  if (!prep.ok || !prepJson.ok) {
    throw new Error(String(prepJson.message || "업로드 준비 실패"));
  }

  const put = await fetch(String(prepJson.signedUrl), {
    method: "PUT",
    headers: {
      "Content-Type": String(prepJson.contentType || "application/octet-stream"),
      ...(prepJson.token ? { Authorization: `Bearer ${prepJson.token}` } : {}),
    },
    body: file,
  });
  if (!put.ok) {
    throw new Error(`Storage 업로드 실패 (HTTP ${put.status})`);
  }

  return {
    storage_path: String(prepJson.path),
    public_url: prepJson.publicUrl ? String(prepJson.publicUrl) : null,
    original_filename: String(prepJson.originalFilename || file.name),
    content_type: String(prepJson.contentType || file.type || "application/octet-stream"),
    size_bytes: file.size,
  };
}

function formatKst(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  } catch {
    return iso;
  }
}

export default function ResourcesPageClient() {
  const searchParams = useSearchParams();
  const highlightPost = searchParams.get("post")?.trim() || "";

  const [items, setItems] = useState<ResourcePostRow[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [maxBytes, setMaxBytes] = useState(200 * 1024 * 1024);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/resources");
      const data = await res.json();
      if (!data.ok) {
        setError(data.message || "목록을 불러오지 못했습니다.");
        setItems([]);
        return;
      }
      setItems(data.items ?? []);
      setCanWrite(Boolean(data.can_write));
      if (typeof data.max_bytes === "number" && data.max_bytes > 0) {
        setMaxBytes(data.max_bytes);
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!highlightPost || loading) return;
    const el = document.getElementById(`resource-post-${highlightPost}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightPost, loading, items]);

  const openCreate = () => {
    setTitle("");
    setBody("");
    setPendingFiles([]);
    setFormError("");
    setSheetOpen(true);
  };

  const onPickFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setFormError("");
    setUploading(true);
    try {
      const next: PendingFile[] = [];
      for (const file of Array.from(fileList)) {
        if (file.size > maxBytes) {
          throw new Error(`"${file.name}" 용량이 너무 큽니다. (최대 ${formatBytes(maxBytes)})`);
        }
        next.push(await uploadResourceFile(file));
      }
      setPendingFiles((prev) => [...prev, ...next]);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch("/api/admin/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          files: pendingFiles,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setFormError(data.message || "등록 실패");
        return;
      }
      setSheetOpen(false);
      showToast("자료를 등록하고 알림을 보냈습니다.");
      await load();
    } catch {
      setFormError("네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  const removePost = async (id: string, postTitle: string) => {
    if (!window.confirm(`「${postTitle}」자료를 삭제할까요?`)) return;
    try {
      const res = await fetch(`/api/admin/resources/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) {
        showToast(data.message || "삭제 실패");
        return;
      }
      showToast("삭제되었습니다.");
      await load();
    } catch {
      showToast("네트워크 오류");
    }
  };

  const maxLabel = useMemo(() => formatBytes(maxBytes), [maxBytes]);

  return (
    <div className="crm-ui-content">
      <CrmPageHeader
        title="자료 공유"
        description="교육·영업 자료를 공유합니다. 관리자가 등록하면 전 직원에게 푸시 알림이 갑니다."
        actions={
          canWrite ? (
            <CrmButton variant="primary" onClick={openCreate}>
              자료 등록
            </CrmButton>
          ) : null
        }
      />

      {toast ? <CrmAlert tone="success">{toast}</CrmAlert> : null}
      {error ? <CrmAlert tone="danger">{error}</CrmAlert> : null}

      {loading ? (
        <div className="crm-skeleton" style={{ height: 180 }} />
      ) : items.length === 0 ? (
        <CrmEmptyState
          title="공유된 자료가 없습니다"
          description={
            canWrite
              ? "제목·내용·파일을 등록해 팀에 공유하세요."
              : "관리자가 자료를 올리면 이 메뉴에서 확인할 수 있습니다."
          }
        />
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {items.map((post) => {
            const highlighted = highlightPost === post.id;
            return (
              <article
                key={post.id}
                id={`resource-post-${post.id}`}
                className="crm-ui-panel"
                style={{
                  padding: 16,
                  outline: highlighted ? "2px solid var(--crm-primary, #5b19c6)" : undefined,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{post.title}</h2>
                    <div style={{ marginTop: 6, fontSize: 12, color: "var(--crm-muted)" }}>
                      {post.created_by_name || "관리자"} · {formatKst(post.created_at)}
                      {post.files.length ? ` · 첨부 ${post.files.length}개` : ""}
                    </div>
                  </div>
                  {canWrite ? (
                    <CrmButton size="sm" variant="danger" onClick={() => void removePost(post.id, post.title)}>
                      삭제
                    </CrmButton>
                  ) : null}
                </div>

                {post.body ? (
                  <p
                    style={{
                      margin: "12px 0 0",
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.55,
                      fontSize: 14,
                    }}
                  >
                    {post.body}
                  </p>
                ) : null}

                {post.files.length > 0 ? (
                  <ul style={{ margin: "14px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
                    {post.files.map((f) => (
                      <li
                        key={f.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid var(--crm-border, #e2e8f0)",
                          background: "var(--crm-surface-2, #f8fafc)",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 13,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={f.original_filename}
                          >
                            {f.original_filename}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--crm-muted)" }}>
                            {formatBytes(Number(f.size_bytes || 0))}
                          </div>
                        </div>
                        <a
                          className="crm-ui-btn crm-ui-btn-secondary crm-ui-btn-sm"
                          href={`/api/admin/resources/files/${f.id}/download`}
                        >
                          다운로드
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <CrmSheet
        open={sheetOpen}
        onClose={() => !saving && setSheetOpen(false)}
        title="자료 등록"
        footer={
          <>
            <CrmButton variant="secondary" disabled={saving || uploading} onClick={() => setSheetOpen(false)}>
              취소
            </CrmButton>
            <CrmButton
              variant="primary"
              disabled={saving || uploading || !title.trim()}
              onClick={() => void submit()}
            >
              {saving ? "등록 중…" : "등록 및 알림"}
            </CrmButton>
          </>
        }
      >
        <div style={{ display: "grid", gap: 14 }}>
          {formError ? <CrmAlert tone="danger">{formError}</CrmAlert> : null}
          <CrmField label="제목" htmlFor="res-title">
            <CrmInput
              id="res-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 9월 교육 자료"
              maxLength={200}
            />
          </CrmField>
          <CrmField label="내용" htmlFor="res-body">
            <textarea
              id="res-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="안내 문구를 입력하세요."
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--crm-border, #e2e8f0)",
                font: "inherit",
                resize: "vertical",
              }}
            />
          </CrmField>
          <CrmField
            label="파일 첨부"
            htmlFor="res-files"
            hint={`최대 ${maxLabel} / 파일 · 한글 파일명 지원 · Storage 직접 업로드`}
          >
            <input
              id="res-files"
              type="file"
              multiple
              disabled={uploading || saving}
              onChange={(e) => {
                void onPickFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </CrmField>
          {uploading ? <CrmBadge>업로드 중…</CrmBadge> : null}
          {pendingFiles.length > 0 ? (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
              {pendingFiles.map((f) => (
                <li
                  key={f.storage_path}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    fontSize: 13,
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: "#f1f5f9",
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.original_filename}
                  </span>
                  <span style={{ color: "var(--crm-muted)", flexShrink: 0 }}>
                    {formatBytes(f.size_bytes)}
                    <button
                      type="button"
                      style={{
                        marginLeft: 8,
                        border: "none",
                        background: "transparent",
                        color: "#b91c1c",
                        cursor: "pointer",
                      }}
                      onClick={() =>
                        setPendingFiles((prev) => prev.filter((x) => x.storage_path !== f.storage_path))
                      }
                    >
                      제거
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </CrmSheet>
    </div>
  );
}
