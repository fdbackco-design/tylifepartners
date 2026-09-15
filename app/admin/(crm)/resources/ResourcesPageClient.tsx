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
import {
  RESOURCE_PRODUCT_TAGS,
  RESOURCE_SITUATION_TAGS,
  RESOURCE_STATUS_TAGS,
  formatBytes,
  isResourcePostNew,
  resourceBodyPreview,
  type ResourcePostRow,
} from "@/lib/crm/resourceShares";

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

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function TagChips({
  product,
  status,
  situation,
}: {
  product: string[];
  status: string[];
  situation: string[];
}) {
  if (!product.length && !status.length && !situation.length) return null;
  return (
    <div className="resource-tags">
      {product.map((t) => (
        <span key={`p-${t}`} className="resource-tag" data-kind="product">
          {t}
        </span>
      ))}
      {status.map((t) => (
        <span key={`st-${t}`} className="resource-tag" data-kind="status">
          {t}
        </span>
      ))}
      {situation.map((t) => (
        <span key={`s-${t}`} className="resource-tag" data-kind="situation">
          {t}
        </span>
      ))}
    </div>
  );
}

export default function ResourcesPageClient() {
  const searchParams = useSearchParams();
  const highlightPost = searchParams.get("post")?.trim() || "";

  const [items, setItems] = useState<ResourcePostRow[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [maxBytes, setMaxBytes] = useState(50 * 1024 * 1024);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [query, setQuery] = useState("");
  const [productFilter, setProductFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [situationFilter, setSituationFilter] = useState<string[]>([]);
  const [expandedBody, setExpandedBody] = useState<Set<string>>(() => new Set());
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(() => new Set());

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [formProductTags, setFormProductTags] = useState<string[]>([]);
  const [formStatusTags, setFormStatusTags] = useState<string[]>([]);
  const [formSituationTags, setFormSituationTags] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [existingFiles, setExistingFiles] = useState<ResourcePostRow["files"]>([]);
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
    setExpandedBody((prev) => new Set(prev).add(highlightPost));
    setExpandedFiles((prev) => new Set(prev).add(highlightPost));
  }, [highlightPost, loading, items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((post) => {
      if (productFilter.length) {
        const tags = post.product_tags ?? [];
        if (!productFilter.every((t) => tags.includes(t))) return false;
      }
      if (statusFilter.length) {
        const tags = post.status_tags ?? [];
        if (!statusFilter.every((t) => tags.includes(t))) return false;
      }
      if (situationFilter.length) {
        const tags = post.situation_tags ?? [];
        if (!situationFilter.every((t) => tags.includes(t))) return false;
      }
      if (!q) return true;
      const hay = [
        post.title,
        post.created_by_name || "",
        ...(post.product_tags ?? []),
        ...(post.status_tags ?? []),
        ...(post.situation_tags ?? []),
        post.body,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, productFilter, statusFilter, situationFilter]);

  const openCreate = () => {
    setEditingId(null);
    setTitle("");
    setBody("");
    setFormProductTags([]);
    setFormStatusTags([]);
    setFormSituationTags([]);
    setPendingFiles([]);
    setExistingFiles([]);
    setFormError("");
    setSheetOpen(true);
  };

  const openEdit = (post: ResourcePostRow) => {
    setEditingId(post.id);
    setTitle(post.title);
    setBody(post.body);
    setFormProductTags([...(post.product_tags ?? [])]);
    setFormStatusTags([...(post.status_tags ?? [])]);
    setFormSituationTags([...(post.situation_tags ?? [])]);
    setPendingFiles([]);
    setExistingFiles(post.files ?? []);
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
      const payload = {
        title,
        body,
        product_tags: formProductTags,
        status_tags: formStatusTags,
        situation_tags: formSituationTags,
        files: pendingFiles,
      };
      const res = await fetch(
        editingId ? `/api/admin/resources/${editingId}` : "/api/admin/resources",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!data.ok) {
        setFormError(data.message || (editingId ? "수정 실패" : "등록 실패"));
        return;
      }
      setSheetOpen(false);
      showToast(editingId ? "자료를 수정했습니다." : "자료를 등록하고 알림을 보냈습니다.");
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
  const hasActiveFilter = Boolean(
    query.trim() || productFilter.length || statusFilter.length || situationFilter.length
  );

  return (
    <div className="crm-ui-content resource-board">
      <CrmPageHeader
        title="자료 공유"
        description=""
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

      <section className="resource-discovery" aria-label="자료 검색 및 필터">
        <div className="resource-search">
          <span className="resource-search-icon" aria-hidden>
            ⌕
          </span>
          <input
            className="resource-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제목 · 작성자 · 태그 검색"
            aria-label="제목, 작성자, 태그 검색"
          />
        </div>

        <div className="resource-filter-group">
          <div className="resource-filter-label">상품</div>
          <div className="resource-filter-list" role="group" aria-label="상품 필터">
            {RESOURCE_PRODUCT_TAGS.map((tag) => {
              const pressed = productFilter.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  className="resource-filter"
                  aria-pressed={pressed}
                  onClick={() => setProductFilter((prev) => toggleInList(prev, tag))}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        <div className="resource-filter-group">
          <div className="resource-filter-label">상품 상태</div>
          <div className="resource-filter-list" role="group" aria-label="상품 상태 필터">
            {RESOURCE_STATUS_TAGS.map((tag) => {
              const pressed = statusFilter.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  className="resource-filter"
                  aria-pressed={pressed}
                  onClick={() => setStatusFilter((prev) => toggleInList(prev, tag))}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        <div className="resource-filter-group">
          <div className="resource-filter-label">영업 상황</div>
          <div className="resource-filter-list" role="group" aria-label="영업 상황 필터">
            {RESOURCE_SITUATION_TAGS.map((tag) => {
              const pressed = situationFilter.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  className="resource-filter"
                  aria-pressed={pressed}
                  onClick={() => setSituationFilter((prev) => toggleInList(prev, tag))}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {!loading && items.length > 0 ? (
        <div className="resource-result-bar">
          <span>
            {hasActiveFilter ? (
              <>
                조건에 맞는 자료 <strong>{filtered.length}</strong>건
                <span className="resource-result-muted"> / 전체 {items.length}건</span>
              </>
            ) : (
              <>
                전체 자료 <strong>{items.length}</strong>건
              </>
            )}
          </span>
          {hasActiveFilter ? (
            <button
              type="button"
              className="resource-clear-filters"
              onClick={() => {
                setQuery("");
                setProductFilter([]);
                setStatusFilter([]);
                setSituationFilter([]);
              }}
            >
              필터 초기화
            </button>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="crm-skeleton" style={{ height: 180 }} />
      ) : items.length === 0 ? (
        <CrmEmptyState
          title="공유된 자료가 없습니다"
          description={
            canWrite
              ? "제목·내용·태그·파일을 등록해 팀에 공유하세요."
              : "관리자가 자료를 올리면 이 메뉴에서 확인할 수 있습니다."
          }
        />
      ) : filtered.length === 0 ? (
        <CrmEmptyState title="검색 결과가 없습니다" description="다른 검색어나 필터를 시도해 보세요." />
      ) : (
        <div className="resource-list">
          {filtered.map((post) => {
            const highlighted = highlightPost === post.id;
            const preview = resourceBodyPreview(post.body);
            const bodyOpen = expandedBody.has(post.id);
            const filesOpen = expandedFiles.has(post.id);
            const isNew = isResourcePostNew(post.created_at);
            return (
              <article
                key={post.id}
                id={`resource-post-${post.id}`}
                className={`resource-item${highlighted ? " is-highlighted" : ""}${canWrite ? "" : " resource-item--solo"}`}
              >
                <div className="resource-item-main">
                  <div className="resource-item-heading">
                    <h2>{post.title}</h2>
                    {isNew ? <span className="resource-new-label">NEW</span> : null}
                  </div>
                  <div className="resource-meta">
                    <span>{post.created_by_name || "관리자"}</span>
                    <span>{formatKst(post.created_at)}</span>
                    <span>첨부 {post.files.length}개</span>
                  </div>
                  {preview ? (
                    bodyOpen ? (
                      <p className="resource-body-full">{post.body}</p>
                    ) : (
                      <p className="resource-preview">{preview}</p>
                    )
                  ) : null}
                  {post.body.trim().length > 72 ? (
                    <button
                      type="button"
                      className="resource-inline-link"
                      onClick={() =>
                        setExpandedBody((prev) => {
                          const next = new Set(prev);
                          if (next.has(post.id)) next.delete(post.id);
                          else next.add(post.id);
                          return next;
                        })
                      }
                    >
                      {bodyOpen ? "본문 접기" : "본문 더보기"}
                    </button>
                  ) : null}
                  <TagChips
                    product={post.product_tags ?? []}
                    status={post.status_tags ?? []}
                    situation={post.situation_tags ?? []}
                  />

                  {post.files.length > 0 ? (
                    <div className="resource-attachments">
                      <button
                        type="button"
                        className="resource-attachments-toggle"
                        aria-expanded={filesOpen}
                        onClick={() =>
                          setExpandedFiles((prev) => {
                            const next = new Set(prev);
                            if (next.has(post.id)) next.delete(post.id);
                            else next.add(post.id);
                            return next;
                          })
                        }
                      >
                        <span className="resource-attachments-chevron" aria-hidden>
                          {filesOpen ? "∨" : ">"}
                        </span>
                        첨부파일
                        <span className="resource-attachments-count">{post.files.length}</span>
                      </button>
                      {filesOpen ? (
                        <ul className="resource-file-list" aria-label={`${post.title} 첨부파일`}>
                          {post.files.map((f) => (
                            <li key={f.id} className="resource-file-row">
                              <div className="resource-file-meta">
                                <div className="resource-file-name" title={f.original_filename}>
                                  {f.original_filename}
                                </div>
                                <div className="resource-file-size">
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
                    </div>
                  ) : null}
                </div>

                {canWrite ? (
                  <div className="resource-item-actions">
                    <CrmButton size="sm" variant="secondary" onClick={() => openEdit(post)}>
                      수정
                    </CrmButton>
                    <CrmButton size="sm" variant="danger" onClick={() => void removePost(post.id, post.title)}>
                      삭제
                    </CrmButton>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <CrmSheet
        open={sheetOpen}
        onClose={() => !saving && setSheetOpen(false)}
        title={editingId ? "자료 수정" : "자료 등록"}
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
              {saving ? (editingId ? "저장 중…" : "등록 중…") : editingId ? "저장" : "등록 및 알림"}
            </CrmButton>
          </>
        }
      >
        <div className="resource-form">
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
              rows={7}
              placeholder="안내 문구를 입력하세요."
              className="resource-textarea"
            />
          </CrmField>

          <fieldset className="resource-tag-fieldset">
            <legend>상품 태그</legend>
            <p className="resource-help">복수 선택 가능 · 없으면 비워 두어도 됩니다.</p>
            <div className="resource-check-grid">
              {RESOURCE_PRODUCT_TAGS.map((tag) => (
                <label key={tag} className="resource-check">
                  <input
                    type="checkbox"
                    checked={formProductTags.includes(tag)}
                    onChange={() => setFormProductTags((prev) => toggleInList(prev, tag))}
                  />
                  <span>{tag}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="resource-tag-fieldset">
            <legend>상품 상태 태그</legend>
            <p className="resource-help">복수 선택 가능 · 없으면 비워 두어도 됩니다.</p>
            <div className="resource-check-grid">
              {RESOURCE_STATUS_TAGS.map((tag) => (
                <label key={tag} className="resource-check">
                  <input
                    type="checkbox"
                    checked={formStatusTags.includes(tag)}
                    onChange={() => setFormStatusTags((prev) => toggleInList(prev, tag))}
                  />
                  <span>{tag}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="resource-tag-fieldset">
            <legend>영업 상황 태그</legend>
            <p className="resource-help">복수 선택 가능 · 없으면 비워 두어도 됩니다.</p>
            <div className="resource-check-grid resource-check-grid--situation">
              {RESOURCE_SITUATION_TAGS.map((tag) => (
                <label key={tag} className="resource-check">
                  <input
                    type="checkbox"
                    checked={formSituationTags.includes(tag)}
                    onChange={() => setFormSituationTags((prev) => toggleInList(prev, tag))}
                  />
                  <span>{tag}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {existingFiles.length > 0 ? (
            <div className="resource-existing-files">
              <div className="resource-existing-label">기존 첨부</div>
              <ul className="resource-file-list">
                {existingFiles.map((f) => (
                  <li key={f.id} className="resource-file-row">
                    <div className="resource-file-meta">
                      <div className="resource-file-name">{f.original_filename}</div>
                      <div className="resource-file-size">{formatBytes(Number(f.size_bytes || 0))}</div>
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
            </div>
          ) : null}

          <CrmField
            label={editingId ? "파일 추가" : "파일 첨부"}
            htmlFor="res-files"
            hint={`최대 ${maxLabel} / 파일 · 한글 파일명 지원`}
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
            <ul className="resource-file-list">
              {pendingFiles.map((f) => (
                <li key={f.storage_path} className="resource-file-row">
                  <div className="resource-file-meta">
                    <div className="resource-file-name">{f.original_filename}</div>
                    <div className="resource-file-size">{formatBytes(f.size_bytes)}</div>
                  </div>
                  <button
                    type="button"
                    className="resource-remove-file"
                    onClick={() =>
                      setPendingFiles((prev) => prev.filter((x) => x.storage_path !== f.storage_path))
                    }
                  >
                    제거
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </CrmSheet>
    </div>
  );
}
