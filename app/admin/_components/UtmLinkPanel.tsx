"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  CrmTable,
  IconCheck,
  IconCopy,
  IconDots,
  IconExternal,
  IconPlus,
  IconSearch,
} from "@/app/admin/_components/crm/ui";
import { buildUtmLink, normalizeUtmSourceValue, type UtmSourceRow } from "@/lib/utmSourceMapping";

type LandingOpt = { id: string; title: string; path: string };

function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidPath(raw: string): boolean {
  const p = raw.trim() || "/";
  return p.startsWith("/") && !/\s/.test(p);
}

export default function UtmLinkPanel() {
  const [baseUrl, setBaseUrl] = useState("https://www.feed-life.com");
  const [path, setPath] = useState("/0715s");
  const [landingMode, setLandingMode] = useState<"pick" | "custom">("custom");
  const [landings, setLandings] = useState<LandingOpt[]>([]);
  const [selectedLandingId, setSelectedLandingId] = useState("");
  const [landingSearch, setLandingSearch] = useState("");

  const [selectedValue, setSelectedValue] = useState("");
  const [items, setItems] = useState<UtmSourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const [sourceSearch, setSourceSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editItem, setEditItem] = useState<UtmSourceRow | null>(null);
  const [formValue, setFormValue] = useState("");
  const [formLabel, setFormLabel] = useState("");
  const [formSheetLabel, setFormSheetLabel] = useState("");
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<UtmSourceRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

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
        const list: UtmSourceRow[] = (data.items ?? []).map((i: UtmSourceRow) => ({
          ...i,
          is_active: i.is_active !== false,
        }));
        setItems(list);
        setSelectedValue((prev) => {
          const active = list.filter((i) => i.is_active !== false);
          if (prev && active.some((i) => i.value === prev)) return prev;
          return active[0]?.value ?? "";
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
    void fetchItems();
    fetch("/api/admin/landings")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.items)) {
          setLandings(
            d.items.map((it: { id: string; title: string; path: string }) => ({
              id: it.id,
              title: it.title,
              path: it.path,
            }))
          );
        }
      })
      .catch(() => {});
  }, [fetchItems]);

  const activeSources = useMemo(() => items.filter((i) => i.is_active !== false), [items]);
  const selectedItem = items.find((i) => i.value === selectedValue);

  const filteredLandings = useMemo(() => {
    const q = landingSearch.trim().toLowerCase();
    if (!q) return landings;
    return landings.filter((l) => `${l.title} ${l.path}`.toLowerCase().includes(q));
  }, [landings, landingSearch]);

  const urlError = baseUrl.trim() && !isValidHttpUrl(baseUrl.trim()) ? "올바른 http(s) URL을 입력해 주세요." : "";
  const pathError = path.trim() && !isValidPath(path) ? "경로는 /로 시작하고 공백이 없어야 합니다." : "";
  const sourceError = !loading && activeSources.length === 0 ? "활성 UTM 소스가 없습니다." : !selectedValue ? "소스를 선택해 주세요." : "";

  const canGenerate =
    isValidHttpUrl(baseUrl.trim()) && isValidPath(path.trim() || "/") && !!selectedValue && !urlError && !pathError;

  const generatedLink = useMemo(() => {
    if (!canGenerate) return "";
    try {
      return buildUtmLink(baseUrl.trim(), path.trim() || "/", selectedValue);
    } catch {
      return "";
    }
  }, [baseUrl, path, selectedValue, canGenerate]);

  const filteredSources = useMemo(() => {
    const q = sourceSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.value.toLowerCase().includes(q) ||
        item.sheet_label.toLowerCase().includes(q)
    );
  }, [items, sourceSearch]);

  const allFilteredSelected =
    filteredSources.length > 0 && filteredSources.every((item) => selectedIds.has(item.id));
  const selectedCount = selectedIds.size;

  useEffect(() => {
    const valid = new Set(items.map((i) => i.id));
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      Array.from(prev).forEach((id) => {
        if (valid.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [items]);

  const toggleSelect = (id: string, next: boolean) => {
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  };

  const toggleSelectAllFiltered = (next: boolean) => {
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      for (const item of filteredSources) {
        if (next) copy.add(item.id);
        else copy.delete(item.id);
      }
      return copy;
    });
  };

  const applyLanding = (id: string) => {
    setSelectedLandingId(id);
    const hit = landings.find((l) => l.id === id);
    if (hit) {
      setPath(hit.path);
      setLandingMode("pick");
    }
  };

  const openCreateSource = () => {
    setEditItem(null);
    setFormValue("");
    setFormLabel("");
    setFormSheetLabel("");
    setFormError("");
    setSheetOpen(true);
  };

  const openEditSource = (item: UtmSourceRow) => {
    setEditItem(item);
    setFormValue(item.value);
    setFormLabel(item.label);
    setFormSheetLabel(item.sheet_label === item.label ? "" : item.sheet_label);
    setFormError("");
    setSheetOpen(true);
  };

  const valuePreview = normalizeUtmSourceValue(formValue);
  const valueDup = !!valuePreview && items.some((i) => i.value === valuePreview && i.id !== editItem?.id);
  const valueFieldError =
    formValue && !valuePreview
      ? "영문·숫자·하이픈·언더스코어만 사용할 수 있습니다."
      : valueDup
        ? "이미 등록된 utm_source 값입니다."
        : "";

  const saveSource = async () => {
    setFormError("");
    if (!formLabel.trim()) {
      setFormError("표시 이름을 입력해 주세요.");
      return;
    }
    if (!valuePreview || valueDup) {
      setFormError(valueFieldError || "utm_source 값을 확인해 주세요.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        value: formValue,
        label: formLabel,
        sheet_label: formSheetLabel || formLabel,
      };
      const res = await fetch(editItem ? `/api/admin/utm-sources/${editItem.id}` : "/api/admin/utm-sources", {
        method: editItem ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) {
        setFormError(data.message || "저장에 실패했습니다.");
        return;
      }
      setSelectedValue(data.item.value);
      setSheetOpen(false);
      await fetchItems();
      showToast(editItem ? "소스가 수정되었습니다." : "소스가 추가되었습니다.");
    } catch {
      setFormError("네트워크 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: UtmSourceRow) => {
    setActionId(item.id);
    const nextActive = item.is_active === false;
    try {
      const res = await fetch(`/api/admin/utm-sources/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: nextActive }),
      });
      const data = await res.json();
      if (!data.ok) {
        showToast(data.message || "상태 변경에 실패했습니다.", true);
        return;
      }
      if (!nextActive && selectedValue === item.value) {
        setSelectedValue("");
      }
      await fetchItems();
      showToast(nextActive ? "소스를 활성화했습니다." : "소스를 비활성화했습니다. 링크 생성 목록에서 제외됩니다.");
    } catch {
      showToast("네트워크 오류가 발생했습니다.", true);
    } finally {
      setActionId(null);
    }
  };

  const deleteSource = async () => {
    if (!confirmDelete) return;
    setActionId(confirmDelete.id);
    try {
      const res = await fetch(`/api/admin/utm-sources/${confirmDelete.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) {
        showToast(data.message || "삭제에 실패했습니다.", true);
        setConfirmDelete(null);
        return;
      }
      if (selectedValue === confirmDelete.value) setSelectedValue("");
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(confirmDelete.id);
        return next;
      });
      setConfirmDelete(null);
      await fetchItems();
      showToast(data.message || "소스가 삭제되었습니다.");
    } catch {
      showToast("네트워크 오류가 발생했습니다.", true);
    } finally {
      setActionId(null);
    }
  };

  const bulkDeleteSources = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const res = await fetch("/api/admin/utm-sources/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!data.ok) {
        showToast(data.message || "삭제에 실패했습니다.", true);
        setBulkConfirmOpen(false);
        return;
      }
      const deletedValues: string[] = data.deleted_values ?? [];
      if (deletedValues.includes(selectedValue)) setSelectedValue("");
      setSelectedIds(new Set());
      setBulkConfirmOpen(false);
      await fetchItems();
      showToast(data.message || `${data.deleted ?? 0}개 소스를 삭제했습니다.`);
    } catch {
      showToast("네트워크 오류가 발생했습니다.", true);
    } finally {
      setBulkDeleting(false);
    }
  };

  const copyLink = async () => {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast("복사에 실패했습니다.", true);
    }
  };

  return (
    <div className="crm-ui-content">
      <CrmPageHeader
        title="UTM 링크 생성기"
        description="광고 및 영업자별 유입 링크를 생성합니다. Meta(FB·IG) 광고는 아래 URL 끝에 ad_id={{ad.id}} 를 붙여 소재 추적이 가능합니다."
      />

      {toast ? (
        <div style={{ marginBottom: 12 }}>
          <CrmAlert tone={toast.error ? "danger" : "success"}>{toast.msg}</CrmAlert>
        </div>
      ) : null}

      <div className="crm-ui-utm-grid">
        <section className="crm-ui-panel">
          <h2 className="crm-ui-section-title">링크 생성</h2>

          <div className="crm-ui-section-block">
            <h3 className="crm-ui-section-subtitle">랜딩페이지</h3>
            {landings.length > 0 && (
              <CrmField label="등록된 랜딩 선택" hint="목록에서 고르거나 아래에서 URL을 직접 입력할 수 있습니다.">
                <CrmInput
                  value={landingSearch}
                  onChange={(e) => setLandingSearch(e.target.value)}
                  placeholder="랜딩 이름·경로 검색"
                  aria-label="랜딩 검색"
                />
                <CrmSelect
                  value={selectedLandingId}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) {
                      setSelectedLandingId("");
                      setLandingMode("custom");
                      return;
                    }
                    applyLanding(id);
                  }}
                  aria-label="랜딩페이지 선택"
                  style={{ marginTop: 8 }}
                >
                  <option value="">직접 입력</option>
                  {filteredLandings.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title} ({l.path})
                    </option>
                  ))}
                </CrmSelect>
              </CrmField>
            )}
            <CrmField label="사이트 URL" htmlFor="utm-base" hint="예: https://www.feed-life.com" error={urlError || undefined}>
              <CrmInput
                id="utm-base"
                type="url"
                value={baseUrl}
                onChange={(e) => {
                  setBaseUrl(e.target.value);
                  setLandingMode("custom");
                }}
                placeholder="https://www.feed-life.com"
              />
            </CrmField>
            <CrmField label="경로" htmlFor="utm-path" hint="예: /0715s 또는 /promo-a" error={pathError || undefined}>
              <CrmInput
                id="utm-path"
                value={path}
                onChange={(e) => {
                  setPath(e.target.value);
                  setSelectedLandingId("");
                  setLandingMode("custom");
                }}
                placeholder="/0715s"
              />
            </CrmField>
          </div>

          <div className="crm-ui-section-block">
            <h3 className="crm-ui-section-subtitle">유입 정보</h3>
            <CrmField
              label="유입 담당자 또는 소스"
              htmlFor="utm-source"
              hint="(utm_source)"
              error={sourceError || undefined}
            >
              {loading ? (
                <div className="crm-ui-hint">목록 불러오는 중…</div>
              ) : (
                <CrmSelect
                  id="utm-source"
                  value={selectedValue}
                  onChange={(e) => setSelectedValue(e.target.value)}
                >
                  {activeSources.length === 0 ? (
                    <option value="">등록된 활성 소스 없음</option>
                  ) : (
                    activeSources.map((item) => (
                      <option key={item.id} value={item.value}>
                        {item.label} · {item.value}
                      </option>
                    ))
                  )}
                </CrmSelect>
              )}
            </CrmField>
            {selectedItem && (
              <CrmAlert tone="info">
                구글 시트 표시명: <strong>{selectedItem.sheet_label}</strong>
                <span style={{ display: "block", marginTop: 4 }}>
                  상담 신청 시 유입매체·담당자 열에 반영됩니다.
                </span>
              </CrmAlert>
            )}
          </div>
        </section>

        <aside className="crm-ui-panel crm-ui-utm-result">
          <h2 className="crm-ui-section-title">생성 결과</h2>
          {!generatedLink ? (
            <CrmEmptyState title="필수 정보를 입력하면 링크가 생성됩니다" description="사이트 URL, 경로, 유입 소스를 확인해 주세요." />
          ) : (
            <>
              <div className="crm-ui-utm-url-row">
                <div className="crm-ui-utm-url" tabIndex={0} aria-label="생성된 UTM URL">
                  {generatedLink}
                </div>
                <CrmButton variant="primary" onClick={() => void copyLink()} aria-label="URL 복사">
                  {copied ? (
                    <>
                      <IconCheck /> 복사됨
                    </>
                  ) : (
                    <>
                      <IconCopy /> 복사
                    </>
                  )}
                </CrmButton>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <a
                  className="crm-ui-btn crm-ui-btn-secondary crm-ui-btn-md"
                  href={generatedLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  <IconExternal /> 링크 열기
                </a>
              </div>
              <div className="crm-ui-utm-summary">
                <div>
                  <span>랜딩</span>
                  <strong>
                    {landingMode === "pick" && selectedLandingId
                      ? landings.find((l) => l.id === selectedLandingId)?.title || path
                      : path}
                  </strong>
                </div>
                <div>
                  <span>표시 이름</span>
                  <strong>{selectedItem?.label || "—"}</strong>
                </div>
                <div>
                  <span>utm_source</span>
                  <strong style={{ fontFamily: "ui-monospace, monospace" }}>{selectedValue}</strong>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <CrmAlert tone="info">
                  Meta(FB·IG) 광고 URL에는 Ads Manager에서 아래 파라미터를 추가하세요.
                  <code style={{ display: "block", marginTop: 6, fontSize: 12, wordBreak: "break-all" }}>
                    &amp;ad_id=&#123;&#123;ad.id&#125;&#125;&amp;adset_id=&#123;&#123;adset.id&#125;&#125;&amp;campaign_id=&#123;&#123;campaign.id&#125;&#125;&amp;utm_content=&#123;&#123;ad.id&#125;&#125;
                  </code>
                  고객 목록 &quot;광고소재&quot; 열에서 이미지·영상 썸네일을 확인할 수 있습니다.
                </CrmAlert>
              </div>
            </>
          )}
        </aside>
      </div>

      <section className="crm-ui-panel" style={{ marginTop: 16 }}>
        <div className="crm-ui-page-header-main" style={{ marginBottom: 12 }}>
          <div>
            <h2 className="crm-ui-section-title" style={{ margin: 0 }}>
              UTM 소스 관리
            </h2>
            <p className="crm-page-desc">링크 생성에 쓰는 유입 소스를 등록·수정합니다.</p>
          </div>
          <CrmButton variant="primary" onClick={openCreateSource}>
            <IconPlus /> 새 소스 추가
          </CrmButton>
        </div>

        <div className="crm-ui-toolbar">
          <div className="crm-ui-search">
            <span className="crm-ui-search-icon">
              <IconSearch />
            </span>
            <CrmInput
              value={sourceSearch}
              onChange={(e) => setSourceSearch(e.target.value)}
              placeholder="이름 또는 값 검색"
              aria-label="소스 검색"
            />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {selectedCount > 0 ? (
              <div className="crm-bulk-bar">
                <span>{selectedCount}개 선택</span>
                <CrmButton
                  variant="danger"
                  disabled={bulkDeleting || !!actionId}
                  onClick={() => setBulkConfirmOpen(true)}
                >
                  선택 삭제
                </CrmButton>
              </div>
            ) : null}
            <CrmBadge tone="primary">{items.length}개 등록</CrmBadge>
          </div>
        </div>

        {loading ? (
          <div className="crm-skeleton" style={{ height: 160 }} />
        ) : items.length === 0 ? (
          <CrmEmptyState
            title="등록된 UTM 소스가 없습니다"
            description="영업자·채널별 유입을 구분할 첫 소스를 추가하세요."
            action={
              <CrmButton variant="primary" onClick={openCreateSource}>
                <IconPlus /> 첫 UTM 소스 추가
              </CrmButton>
            }
          />
        ) : filteredSources.length === 0 ? (
          <CrmEmptyState title="검색 결과가 없습니다" description="다른 검색어를 입력해 보세요." />
        ) : (
          <CrmTable>
            <thead>
              <tr>
                <th style={{ width: 44 }}>
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={(e) => toggleSelectAllFiltered(e.target.checked)}
                    aria-label="현재 목록 전체 선택"
                  />
                </th>
                <th>이름</th>
                <th>실제 값</th>
                <th>구글 시트 표시명</th>
                <th>상태</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {filteredSources.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={(e) => toggleSelect(item.id, e.target.checked)}
                      aria-label={`${item.label} 선택`}
                    />
                  </td>
                  <td style={{ fontWeight: 600 }}>{item.label}</td>
                  <td style={{ fontFamily: "ui-monospace, monospace", color: "var(--crm-muted)" }}>{item.value}</td>
                  <td>{item.sheet_label}</td>
                  <td>
                    {item.is_active === false ? (
                      <CrmBadge tone="neutral">비활성</CrmBadge>
                    ) : (
                      <CrmBadge tone="success">활성</CrmBadge>
                    )}
                  </td>
                  <td>
                    <CrmMenu trigger={<IconDots />} align="right">
                      <CrmMenuItem onClick={() => openEditSource(item)} disabled={!!actionId || bulkDeleting}>
                        수정
                      </CrmMenuItem>
                      <CrmMenuItem
                        onClick={() => void toggleActive(item)}
                        disabled={actionId === item.id || bulkDeleting}
                      >
                        {item.is_active === false ? "활성화" : "비활성화"}
                      </CrmMenuItem>
                      <CrmMenuItem
                        tone="danger"
                        onClick={() => setConfirmDelete(item)}
                        disabled={!!actionId || bulkDeleting}
                      >
                        삭제
                      </CrmMenuItem>
                    </CrmMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </CrmTable>
        )}
      </section>

      <CrmSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editItem ? "소스 수정" : "새 소스 추가"}
        footer={
          <>
            <CrmButton variant="secondary" onClick={() => setSheetOpen(false)}>
              취소
            </CrmButton>
            <CrmButton variant="primary" disabled={saving} onClick={() => void saveSource()}>
              {saving ? "저장 중…" : "저장"}
            </CrmButton>
          </>
        }
      >
        <CrmField label="표시 이름" htmlFor="src-label" hint="예: 김영업, 유튜브 광고">
          <CrmInput id="src-label" value={formLabel} onChange={(e) => setFormLabel(e.target.value)} placeholder="김영업" />
        </CrmField>
        <CrmField
          label="실제 utm_source 값"
          htmlFor="src-value"
          hint="예: kim_sales, youtube_ads — 영문·숫자·-·_ 만"
          error={valueFieldError || undefined}
        >
          <CrmInput
            id="src-value"
            value={formValue}
            onChange={(e) => setFormValue(e.target.value)}
            placeholder="kim_sales"
            autoCapitalize="off"
            spellCheck={false}
          />
        </CrmField>
        <CrmField
          label="구글 시트 표시명"
          htmlFor="src-sheet"
          hint="비우면 표시 이름이 사용됩니다. 시트 C/G열에 들어갑니다."
        >
          <CrmInput
            id="src-sheet"
            value={formSheetLabel}
            onChange={(e) => setFormSheetLabel(e.target.value)}
            placeholder="표시 이름과 동일"
          />
        </CrmField>
        {formError ? <CrmAlert tone="danger">{formError}</CrmAlert> : null}
      </CrmSheet>

      <CrmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="소스 삭제"
        footer={
          <>
            <CrmButton variant="secondary" onClick={() => setConfirmDelete(null)}>
              취소
            </CrmButton>
            <CrmButton variant="danger" disabled={!!actionId} onClick={() => void deleteSource()}>
              삭제
            </CrmButton>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          <strong>
            {confirmDelete?.label} ({confirmDelete?.value})
          </strong>
          을(를) 삭제할까요? 이미 유입된 고객의 utm_source 값은 유지되며, 링크 생성·소스 목록에서만
          사라집니다.
        </p>
      </CrmDialog>

      <CrmDialog
        open={bulkConfirmOpen}
        onClose={() => {
          if (!bulkDeleting) setBulkConfirmOpen(false);
        }}
        title="선택 소스 삭제"
        footer={
          <>
            <CrmButton variant="secondary" disabled={bulkDeleting} onClick={() => setBulkConfirmOpen(false)}>
              취소
            </CrmButton>
            <CrmButton variant="danger" disabled={bulkDeleting} onClick={() => void bulkDeleteSources()}>
              {bulkDeleting ? "삭제 중…" : `${selectedCount}개 삭제`}
            </CrmButton>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          선택한 <strong>{selectedCount}</strong>개 소스를 삭제할까요? 사용 중인 소스도 삭제되며, 기존
          고객 데이터의 utm_source 값은 그대로 유지됩니다.
        </p>
      </CrmDialog>
    </div>
  );
}
