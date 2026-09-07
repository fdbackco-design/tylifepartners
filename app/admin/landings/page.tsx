"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ManagedLandingRow } from "@/lib/managedLandings/types";
import { normalizeLandingPath } from "@/lib/managedLandings/types";
import {
  CrmAlert,
  CrmBadge,
  CrmButton,
  CrmDialog,
  CrmEmptyState,
  CrmField,
  CrmInput,
  CrmMenu,
  CrmMenuItem,
  CrmPageHeader,
  CrmSelect,
  CrmSheet,
  CrmSwitch,
  IconCopy,
  IconDots,
  IconPlus,
  IconSearch,
} from "@/app/admin/_components/crm/ui";

type LandingItem = ManagedLandingRow & {
  lead_count?: number;
  builtin?: boolean;
  landing_key?: string;
};

function absoluteUrl(path: string, host?: string | null) {
  if (typeof window === "undefined") return path;
  const origin = host ? `https://${host}` : window.location.origin;
  return `${origin}${path}`;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AdminLandingsListPage() {
  const [items, setItems] = useState<LandingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"template" | "code">("template");
  const [creating, setCreating] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [newTitle, setNewTitle] = useState("상담 안내");
  const [newPublished, setNewPublished] = useState(false);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [formError, setFormError] = useState("");
  const [redeployId, setRedeployId] = useState<string | null>(null);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/landings");
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || "불러오기 실패");
        return;
      }
      setItems(json.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (statusFilter === "published" && !it.published) return false;
      if (statusFilter === "draft" && it.published) return false;
      if (!q) return true;
      return `${it.title} ${it.path}`.toLowerCase().includes(q);
    });
  }, [items, search, statusFilter]);

  const pathPreview = normalizeLandingPath(newPath);
  const fullPreview = pathPreview ? absoluteUrl(pathPreview) : "";
  const pathDuplicate = !!pathPreview && items.some((it) => normalizeLandingPath(it.path) === pathPreview);

  const openCreate = (mode: "template" | "code" = "template") => {
    setCreateMode(mode);
    setNewPath("");
    setNewTitle("상담 안내");
    setNewPublished(false);
    setZipFile(null);
    setRedeployId(null);
    setFormError("");
    setSheetOpen(true);
  };

  const openRedeploy = (it: LandingItem) => {
    setCreateMode("code");
    setRedeployId(it.id);
    setNewPath(it.path);
    setNewTitle(it.title);
    setNewPublished(it.published);
    setZipFile(null);
    setFormError("");
    setSheetOpen(true);
  };

  const uploadZipToStorage = async (file: File): Promise<string> => {
    const prep = await fetch("/api/admin/landings/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type || "application/zip",
        size: file.size,
      }),
    });
    const prepJson = await prep.json();
    if (!prep.ok) throw new Error(prepJson.message || "업로드 준비 실패");

    const put = await fetch(prepJson.signedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/zip",
        ...(prepJson.token ? { Authorization: `Bearer ${prepJson.token}` } : {}),
      },
      body: file,
    });
    if (!put.ok) throw new Error("ZIP Storage 업로드 실패");
    return String(prepJson.path);
  };

  const create = async () => {
    setFormError("");
    if (!pathPreview) {
      setFormError("URL 경로를 입력해 주세요.");
      return;
    }
    if (!redeployId && pathDuplicate) {
      setFormError("이미 사용 중인 경로입니다.");
      return;
    }

    if (createMode === "code") {
      if (!zipFile) {
        setFormError("React/Next 소스 ZIP 파일을 선택해 주세요.");
        return;
      }
      setCreating(true);
      try {
        const storagePath = await uploadZipToStorage(zipFile);
        const res = await fetch("/api/admin/landings/deploy-zip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storagePath,
            path: pathPreview,
            title: newTitle.trim() || "상담 안내",
            published: newPublished,
            replaceId: redeployId,
            sourceZipName: zipFile.name,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setFormError(json.message || "ZIP 배포 실패");
          return;
        }
        setSheetOpen(false);
        setToast(
          json.warnings?.length
            ? `배포 완료 (경고 ${json.warnings.length}건)`
            : "코드 ZIP 랜딩을 배포했습니다."
        );
        await load();
        if (!redeployId && json.landing?.id) {
          window.location.href = `/admin/landings/${json.landing.id}`;
        }
      } catch (e) {
        setFormError(e instanceof Error ? e.message : String(e));
      } finally {
        setCreating(false);
      }
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/admin/landings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pathPreview, title: newTitle.trim() || "상담 안내", published: newPublished }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFormError(json.message || "생성 실패");
        return;
      }
      window.location.href = `/admin/landings/${json.item.id}`;
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const togglePublished = async (it: LandingItem) => {
    const res = await fetch(`/api/admin/landings/${it.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: !it.published }),
    });
    const json = await res.json();
    if (!res.ok) {
      setToast(json.message || "상태 변경 실패");
      return;
    }
    setItems((prev) =>
      prev.map((x) =>
        x.id === it.id ? { ...x, ...json.item, builtin: x.builtin, landing_key: x.landing_key } : x
      )
    );
    setToast(it.published ? "비공개로 변경했습니다." : "공개로 변경했습니다.");
  };

  const copyUrl = async (it: LandingItem) => {
    const url = absoluteUrl(it.path, it.custom_host);
    try {
      await navigator.clipboard.writeText(url);
      setToast("URL을 복사했습니다.");
    } catch {
      setToast("복사에 실패했습니다.");
    }
  };

  const duplicate = async (it: LandingItem) => {
    const base = normalizeLandingPath(it.path);
    let candidate = `${base}-copy`;
    let n = 2;
    while (items.some((x) => normalizeLandingPath(x.path) === candidate)) {
      candidate = `${base}-copy${n}`;
      n += 1;
    }
    const res = await fetch("/api/admin/landings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: candidate,
        title: `${it.title} 복사본`,
        published: false,
        hero1_url: it.hero1_url,
        hero2_url: it.hero2_url,
        show_brochure: it.show_brochure,
        brochure_url: it.brochure_url,
        cta_position: it.cta_position,
        sections: it.sections,
        form_config: it.form_config,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setToast(json.message || "복제 실패");
      return;
    }
    setToast("랜딩페이지를 복제했습니다.");
    await load();
  };

  const remove = async () => {
    if (!deleteId) return;
    const res = await fetch(`/api/admin/landings/${deleteId}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      setToast(json.message || "삭제 실패");
      setDeleteId(null);
      return;
    }
    setDeleteId(null);
    setToast("랜딩페이지를 삭제했습니다.");
    await load();
  };

  return (
    <div className="crm-ui-content">
      <CrmPageHeader
        title="랜딩페이지 관리"
        description="상담 유입용 랜딩페이지를 만들고 공개 상태를 관리합니다."
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <CrmButton variant="secondary" onClick={() => openCreate("code")}>
              코드 ZIP 배포
            </CrmButton>
            <CrmButton variant="primary" onClick={() => openCreate("template")}>
              <IconPlus /> 템플릿 랜딩
            </CrmButton>
          </div>
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
        <div className="crm-ui-search">
          <span className="crm-ui-search-icon">
            <IconSearch />
          </span>
          <CrmInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름 또는 경로 검색"
            aria-label="랜딩 검색"
          />
        </div>
        <CrmSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="상태 필터" style={{ width: 140 }}>
          <option value="all">상태 전체</option>
          <option value="published">공개</option>
          <option value="draft">비공개</option>
        </CrmSelect>
      </div>

      {loading ? (
        <div className="crm-skeleton" style={{ height: 240 }} />
      ) : items.length === 0 ? (
        <CrmEmptyState
          title="랜딩페이지가 없습니다"
          description="상담 신청을 받는 랜딩페이지를 만들어 유입 경로와 전환을 관리하세요."
          action={
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <CrmButton variant="secondary" onClick={() => openCreate("code")}>
                코드 ZIP 배포
              </CrmButton>
              <CrmButton variant="primary" onClick={() => openCreate("template")}>
                <IconPlus /> 템플릿 랜딩
              </CrmButton>
            </div>
          }
        />
      ) : filtered.length === 0 ? (
        <CrmEmptyState title="검색 결과가 없습니다" description="검색어나 상태 필터를 바꿔 보세요." />
      ) : (
        <div className="crm-ui-landing-grid">
          {filtered.map((it) => {
            const url = absoluteUrl(it.path, it.custom_host);
            return (
              <article key={it.id} className="crm-ui-landing-card">
                <img
                  className="crm-ui-landing-thumb"
                  src={it.hero1_url || "/icon.png"}
                  alt=""
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/icon.png";
                  }}
                />
                <div className="crm-ui-landing-body">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                    <h3 className="crm-ui-landing-title">{it.title}</h3>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {it.builtin ? <CrmBadge tone="primary">고정</CrmBadge> : null}
                      {!it.builtin && it.kind === "code" ? <CrmBadge>코드</CrmBadge> : null}
                      <CrmBadge tone={it.published ? "success" : "neutral"}>{it.published ? "공개" : "비공개"}</CrmBadge>
                    </div>
                  </div>
                  <div className="crm-ui-landing-url">
                    <span>{url}</span>
                    <CrmButton size="sm" variant="ghost" aria-label="URL 복사" onClick={() => void copyUrl(it)}>
                      <IconCopy />
                    </CrmButton>
                  </div>
                  <div className="crm-ui-landing-meta">
                    <span>생성 {formatDate(it.created_at)}</span>
                    <span>수정 {formatDate(it.updated_at)}</span>
                    <span>유입 DB {Number(it.lead_count ?? 0).toLocaleString()}건</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <CrmSwitch
                      checked={it.published}
                      onChange={() => void togglePublished(it)}
                      label={it.published ? "공개" : "비공개"}
                    />
                    {it.builtin ? (
                      <span style={{ fontSize: 12, color: "var(--crm-muted)" }}>고정 배포</span>
                    ) : null}
                  </div>
                  <div className="crm-ui-landing-actions">
                    <CrmButton
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setPreviewSrc(it.path);
                      }}
                    >
                      미리보기
                    </CrmButton>
                    {it.builtin ? (
                      <>
                        <a
                          className="crm-ui-btn crm-ui-btn-primary crm-ui-btn-sm"
                          href={it.path}
                          target="_blank"
                          rel="noreferrer"
                        >
                          열기
                        </a>
                        {it.landing_key ? (
                          <Link
                            href={`/admin/landing-analytics?landing_key=${encodeURIComponent(it.landing_key)}`}
                            className="crm-ui-btn crm-ui-btn-secondary crm-ui-btn-sm"
                          >
                            히트맵
                          </Link>
                        ) : null}
                      </>
                    ) : it.kind === "code" ? (
                      <CrmButton size="sm" variant="primary" onClick={() => openRedeploy(it)}>
                        ZIP 재배포
                      </CrmButton>
                    ) : (
                      <Link href={`/admin/landings/${it.id}`} className="crm-ui-btn crm-ui-btn-primary crm-ui-btn-sm">
                        편집
                      </Link>
                    )}
                    <CrmMenu trigger={<IconDots />} align="right">
                      <CrmMenuItem onClick={() => void copyUrl(it)}>URL 복사</CrmMenuItem>
                      {!it.builtin && it.kind !== "code" ? (
                        <CrmMenuItem onClick={() => void duplicate(it)}>복제</CrmMenuItem>
                      ) : null}
                      {!it.builtin ? (
                        <CrmMenuItem tone="danger" onClick={() => setDeleteId(it.id)}>
                          삭제
                        </CrmMenuItem>
                      ) : null}
                    </CrmMenu>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <CrmSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={
          createMode === "code"
            ? redeployId
              ? "코드 ZIP 재배포"
              : "코드 ZIP 배포"
            : "새 템플릿 랜딩"
        }
        footer={
          <>
            <CrmButton variant="secondary" onClick={() => setSheetOpen(false)}>
              취소
            </CrmButton>
            <CrmButton variant="primary" disabled={creating} onClick={() => void create()}>
              {creating
                ? createMode === "code"
                  ? "배포 중…"
                  : "생성 중…"
                : createMode === "code"
                  ? "배포"
                  : "생성"}
            </CrmButton>
          </>
        }
      >
        {createMode === "code" ? (
          <CrmAlert tone="info">
            React/Next 소스 ZIP (`app/page.tsx`, CSS, `public/assets`, lead-form)을 올리면 경로에 배포되고
            스크롤 히트맵·상담 CRM이 자동 연결됩니다.
          </CrmAlert>
        ) : null}
        <CrmField label="랜딩페이지 이름" htmlFor="lp-title">
          <CrmInput id="lp-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="상담 안내" />
        </CrmField>
        <CrmField
          label="배포 경로"
          htmlFor="lp-path"
          hint="예: /0908 또는 /promo-a"
          error={!redeployId && pathDuplicate ? "이미 사용 중인 경로입니다." : undefined}
        >
          <CrmInput
            id="lp-path"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            placeholder="/promo-a"
            disabled={!!redeployId}
          />
        </CrmField>
        {fullPreview ? (
          <CrmAlert tone="info">
            공개 URL: <strong>{fullPreview}</strong>
          </CrmAlert>
        ) : null}
        {createMode === "code" ? (
          <CrmField label="소스 ZIP" htmlFor="lp-zip" hint="최대 40MB · app/page.tsx 포함">
            <input
              id="lp-zip"
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => setZipFile(e.target.files?.[0] ?? null)}
            />
            {zipFile ? (
              <div style={{ marginTop: 8, fontSize: 13, color: "var(--crm-muted)" }}>
                {zipFile.name} ({Math.round(zipFile.size / 1024)} KB)
              </div>
            ) : null}
          </CrmField>
        ) : null}
        <CrmField label="공개 상태">
          <CrmSwitch checked={newPublished} onChange={setNewPublished} label={newPublished ? "공개" : "비공개"} />
        </CrmField>
        {formError ? <CrmAlert tone="danger">{formError}</CrmAlert> : null}
      </CrmSheet>

      <CrmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="랜딩페이지 삭제"
        footer={
          <>
            <CrmButton variant="secondary" onClick={() => setDeleteId(null)}>
              취소
            </CrmButton>
            <CrmButton variant="danger" onClick={() => void remove()}>
              삭제
            </CrmButton>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          이 랜딩페이지를 삭제할까요? 이미 수집된 상담 신청 데이터는 유지됩니다.
        </p>
      </CrmDialog>

      {previewSrc && (
        <div className="crm-ui-overlay crm-ui-overlay-center" role="presentation">
          <button type="button" className="crm-ui-overlay-backdrop" aria-label="닫기" onClick={() => setPreviewSrc(null)} />
          <div
            className="crm-ui-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="랜딩 미리보기"
            style={{ width: "min(960px, calc(100vw - 24px))", height: "min(85vh, 800px)", margin: "auto" }}
          >
            <div className="crm-ui-dialog-head">
              <h2>미리보기</h2>
              <div style={{ display: "flex", gap: 8 }}>
                <a className="crm-ui-btn crm-ui-btn-secondary crm-ui-btn-sm" href={previewSrc} target="_blank" rel="noreferrer">
                  새 탭
                </a>
                <CrmButton variant="ghost" size="sm" onClick={() => setPreviewSrc(null)}>
                  닫기
                </CrmButton>
              </div>
            </div>
            <iframe title="랜딩 미리보기" src={previewSrc} style={{ border: 0, width: "100%", flex: 1, background: "#fff" }} />
          </div>
        </div>
      )}
    </div>
  );
}
