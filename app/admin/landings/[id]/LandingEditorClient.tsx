"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ManagedLandingPage from "@/app/_components/ManagedLandingPage";
import {
  CrmAlert,
  CrmBadge,
  CrmButton,
  CrmCheckbox,
  CrmField,
  CrmInput,
  CrmPageHeader,
  CrmSelect,
  CrmSwitch,
} from "@/app/admin/_components/crm/ui";
import { formatYRatio, yRatio } from "@/lib/landingScrollMetrics";
import type {
  ManagedCtaPosition,
  ManagedFormConfig,
  ManagedLandingRow,
  ManagedLandingSection,
} from "@/lib/managedLandings/types";
import { DEFAULT_FORM_CONFIG } from "@/lib/managedLandings/formConfig";
import { BASE_REGIONS, type BaseRegion } from "@/lib/regions";

const REGION_GROUPS: { zone: string; regions: BaseRegion[] }[] = [
  { zone: "수도권", regions: ["서울", "인천", "경기"] },
  { zone: "충청권", regions: ["대전", "세종", "충북", "충남"] },
  { zone: "경상권", regions: ["부산", "대구", "울산", "경북", "경남"] },
  { zone: "전라권", regions: ["전북", "전남광주"] },
  { zone: "강원권", regions: ["강원"] },
  { zone: "제주권", regions: ["제주"] },
];

async function parseJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 160);
    if (/request entity too large/i.test(snippet)) {
      throw new Error("파일이 너무 큽니다. 15MB 이하로 올려 주세요.");
    }
    throw new Error(snippet || `업로드 실패 (HTTP ${res.status})`);
  }
}

async function uploadFile(file: File): Promise<string> {
  const prepRes = await fetch("/api/admin/landings/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      size: file.size,
    }),
  });
  const prep = await parseJsonResponse(prepRes);
  if (!prepRes.ok) {
    throw new Error(String(prep.message || "업로드 준비 실패"));
  }

  const signedUrl = String(prep.signedUrl || "");
  const publicUrl = String(prep.publicUrl || "");
  if (!signedUrl || !publicUrl) {
    throw new Error("업로드 URL을 받지 못했습니다.");
  }

  const putRes = await fetch(signedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || String(prep.contentType || "application/octet-stream"),
    },
    body: file,
  });
  if (!putRes.ok) {
    const errText = (await putRes.text()).replace(/\s+/g, " ").trim().slice(0, 160);
    throw new Error(errText || `파일 업로드 실패 (HTTP ${putRes.status})`);
  }

  return publicUrl;
}

function fileNameFromUrl(url: string): string {
  try {
    const u = new URL(url, "https://local.invalid");
    const name = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "");
    return name || url;
  } catch {
    return url.split("/").filter(Boolean).pop() || url;
  }
}

function EditorAccordion({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`crm-landing-accordion${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="crm-landing-accordion-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{title}</span>
        <span className="crm-landing-accordion-chevron" aria-hidden>
          ▾
        </span>
      </button>
      {open ? <div className="crm-landing-accordion-body">{children}</div> : null}
    </div>
  );
}

function AssetField({
  label,
  hint,
  value,
  onChange,
  accept,
  kind = "image",
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
  accept: string;
  kind?: "image" | "file";
}) {
  const [busy, setBusy] = useState(false);
  const [urlDraft, setUrlDraft] = useState(value);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUrlDraft(value);
  }, [value]);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadFile(file);
      onChange(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const name = value.trim() ? fileNameFromUrl(value.trim()) : "";

  return (
    <CrmField label={label} hint={hint}>
      <div className="crm-landing-asset">
        {value.trim() ? (
          <div className="crm-landing-asset-row">
            <div className="crm-landing-asset-thumb" aria-hidden>
              {kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={value} alt="" />
              ) : (
                "FILE"
              )}
            </div>
            <div className="crm-landing-asset-meta">
              <div className="crm-landing-asset-name" title={name}>
                {name}
              </div>
              <div className="crm-landing-asset-url" title={value}>
                {value}
              </div>
              <div className="crm-landing-asset-actions">
                <CrmButton
                  type="button"
                  size="sm"
                  className="crm-landing-file-btn"
                  disabled={busy}
                >
                  {busy ? "업로드 중…" : "교체"}
                  <input
                    ref={fileRef}
                    type="file"
                    accept={accept}
                    disabled={busy}
                    onChange={(e) => void onPick(e.target.files?.[0])}
                  />
                </CrmButton>
                <CrmButton type="button" size="sm" variant="ghost" onClick={() => onChange("")}>
                  삭제
                </CrmButton>
              </div>
            </div>
          </div>
        ) : (
          <div className="crm-landing-asset-empty">
            <CrmButton type="button" size="sm" className="crm-landing-file-btn" disabled={busy}>
              {busy ? "업로드 중…" : kind === "image" ? "이미지 업로드" : "파일 업로드"}
              <input
                ref={fileRef}
                type="file"
                accept={accept}
                disabled={busy}
                onChange={(e) => void onPick(e.target.files?.[0])}
              />
            </CrmButton>
            <CrmInput
              value={urlDraft}
              placeholder="또는 URL 직접 입력"
              onChange={(e) => setUrlDraft(e.target.value)}
              onBlur={() => onChange(urlDraft.trim())}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onChange(urlDraft.trim());
                }
              }}
            />
          </div>
        )}
        {value.trim() ? (
          <CrmInput
            value={urlDraft}
            aria-label={`${label} URL`}
            onChange={(e) => setUrlDraft(e.target.value)}
            onBlur={() => onChange(urlDraft.trim())}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onChange(urlDraft.trim());
              }
            }}
          />
        ) : null}
      </div>
    </CrmField>
  );
}

type DraftState = {
  path: string;
  title: string;
  customHost: string;
  hero1: string;
  hero2: string;
  showBrochure: boolean;
  brochureUrl: string;
  ctaPosition: ManagedCtaPosition;
  published: boolean;
  formConfig: ManagedFormConfig;
  sections: ManagedLandingSection[];
};

function draftKey(d: DraftState): string {
  return JSON.stringify(d);
}

function applyItemToDraft(it: ManagedLandingRow): DraftState {
  return {
    path: it.path,
    title: it.title,
    customHost: it.custom_host ?? "",
    hero1: it.hero1_url,
    hero2: it.hero2_url,
    showBrochure: it.show_brochure,
    brochureUrl: it.brochure_url ?? "",
    ctaPosition: it.cta_position,
    published: it.published,
    formConfig: it.form_config ?? DEFAULT_FORM_CONFIG,
    sections: it.sections ?? [],
  };
}

export default function AdminLandingEditor({ landingId }: { landingId: string }) {
  const [item, setItem] = useState<ManagedLandingRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [previewMode, setPreviewMode] = useState<"mobile" | "desktop">("mobile");
  const [savedKey, setSavedKey] = useState("");

  const [path, setPath] = useState("");
  const [title, setTitle] = useState("");
  const [customHost, setCustomHost] = useState("");
  const [hero1, setHero1] = useState("");
  const [hero2, setHero2] = useState("");
  const [showBrochure, setShowBrochure] = useState(false);
  const [brochureUrl, setBrochureUrl] = useState("");
  const [ctaPosition, setCtaPosition] = useState<ManagedCtaPosition>("from_bottom");
  const [published, setPublished] = useState(false);
  const [formConfig, setFormConfig] = useState<ManagedFormConfig>(DEFAULT_FORM_CONFIG);
  const [sections, setSections] = useState<ManagedLandingSection[]>([]);
  const [sectionLabel, setSectionLabel] = useState("");
  const [yHint, setYHint] = useState("0.0000");
  const previewScrollRef = useRef<HTMLDivElement>(null);

  const currentDraft = useMemo<DraftState>(
    () => ({
      path,
      title,
      customHost,
      hero1,
      hero2,
      showBrochure,
      brochureUrl,
      ctaPosition,
      published,
      formConfig,
      sections,
    }),
    [
      path,
      title,
      customHost,
      hero1,
      hero2,
      showBrochure,
      brochureUrl,
      ctaPosition,
      published,
      formConfig,
      sections,
    ]
  );

  const dirty = Boolean(savedKey) && draftKey(currentDraft) !== savedKey;

  const hydrate = useCallback((it: ManagedLandingRow) => {
    const d = applyItemToDraft(it);
    setItem(it);
    setPath(d.path);
    setTitle(d.title);
    setCustomHost(d.customHost);
    setHero1(d.hero1);
    setHero2(d.hero2);
    setShowBrochure(d.showBrochure);
    setBrochureUrl(d.brochureUrl);
    setCtaPosition(d.ctaPosition);
    setPublished(d.published);
    setFormConfig(d.formConfig);
    setSections(d.sections);
    setSavedKey(draftKey(d));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/landings/${landingId}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || "불러오기 실패");
        return;
      }
      hydrate(json.item as ManagedLandingRow);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [hydrate, landingId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const confirmLeave = () => {
    if (!dirty) return true;
    return window.confirm("저장되지 않은 변경사항이 있습니다. 페이지를 떠나시겠습니까?");
  };

  /** 미리보기 스크롤 컨테이너 기준 — 페이지 최상단=0, 현재 보이는 상단 경계=측정점 */
  const readPreviewTopRatio = useCallback((): number => {
    const el = previewScrollRef.current;
    if (!el) return 0;
    const scrollHeight = el.scrollHeight;
    if (scrollHeight <= 0) return 0;
    return yRatio(el.scrollTop, scrollHeight);
  }, []);

  useEffect(() => {
    const el = previewScrollRef.current;
    const refresh = () => setYHint(formatYRatio(readPreviewTopRatio()));
    refresh();
    if (!el) return;
    el.addEventListener("scroll", refresh, { passive: true });
    window.addEventListener("resize", refresh, { passive: true });
    return () => {
      el.removeEventListener("scroll", refresh);
      window.removeEventListener("resize", refresh);
    };
  }, [readPreviewTopRatio, item, hero1, hero2, previewMode]);

  const save = async (patch?: Partial<ManagedLandingRow>) => {
    setSaving(true);
    setMsg("");
    setError("");
    try {
      const body = {
        path,
        title,
        custom_host: customHost || null,
        hero1_url: hero1,
        hero2_url: hero2,
        show_brochure: showBrochure,
        brochure_url: showBrochure ? brochureUrl || null : null,
        cta_position: ctaPosition,
        published,
        form_config: formConfig,
        sections,
        ...patch,
      };
      const res = await fetch(`/api/admin/landings/${landingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || "저장 실패");
        return false;
      }
      const it = json.item as ManagedLandingRow;
      hydrate(it);
      setMsg("저장되었습니다.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const cancelChanges = () => {
    if (!item) return;
    if (dirty && !window.confirm("저장되지 않은 변경을 모두 취소할까요?")) return;
    hydrate(item);
    setMsg("변경을 취소했습니다.");
    setError("");
  };

  const markSectionPoint = () => {
    const end = readPreviewTopRatio();
    const prevEnd = sections.length > 0 ? Math.max(...sections.map((s) => s.end)) : 0;
    const start = prevEnd;

    if (end <= start + 0.0005) {
      setError(
        "현재 위치가 이전 구간 끝과 같거나 앞에 있습니다. 미리보기를 더 아래로 스크롤한 뒤 다시 찍어주세요."
      );
      return;
    }

    const idx = sections.length + 1;
    const next: ManagedLandingSection = {
      name: `section_${String(idx).padStart(2, "0")}`,
      label: sectionLabel.trim() || `${idx}. 구간`,
      start,
      end,
    };
    setSections((prev) => [...prev, next]);
    setSectionLabel("");
    setError("");
    setMsg(
      `구간 추가: ${next.label} (${formatYRatio(start)}–${formatYRatio(end)}) · 다음 구간은 이어서 찍습니다.`
    );
  };

  const closeLastSectionToEnd = () => {
    const prevEnd = sections.length > 0 ? Math.max(...sections.map((s) => s.end)) : 0;
    if (prevEnd >= 0.999) {
      setError("이미 페이지 끝까지 구간이 채워져 있습니다.");
      return;
    }
    const idx = sections.length + 1;
    const next: ManagedLandingSection = {
      name: `section_${String(idx).padStart(2, "0")}`,
      label: sectionLabel.trim() || `${idx}. 구간`,
      start: prevEnd,
      end: 1,
    };
    setSections((prev) => [...prev, next]);
    setSectionLabel("");
    setError("");
    setMsg(`마지막 구간 마감: ${next.label} (${formatYRatio(prevEnd)}–1.0000)`);
  };

  const toggleRegion = (r: BaseRegion) => {
    setFormConfig((c) => {
      const set = new Set(c.allowedRegions);
      if (set.has(r)) set.delete(r);
      else set.add(r);
      return { ...c, allowedRegions: BASE_REGIONS.filter((x) => set.has(x)) };
    });
  };

  const toggleZone = (regions: BaseRegion[], selectAll: boolean) => {
    setFormConfig((c) => {
      const set = new Set(c.allowedRegions);
      for (const r of regions) {
        if (selectAll) set.add(r);
        else set.delete(r);
      }
      return { ...c, allowedRegions: BASE_REGIONS.filter((x) => set.has(x)) };
    });
  };

  const previewProps = useMemo(() => {
    if (!item) return null;
    return {
      id: item.id,
      slug: item.slug,
      path,
      title,
      hero1Url: hero1,
      hero2Url: hero2,
      showBrochure,
      brochureUrl: showBrochure ? brochureUrl || null : null,
      ctaPosition,
      sections,
      formConfig,
      previewMode: true as const,
    };
  }, [item, path, title, hero1, hero2, showBrochure, brochureUrl, ctaPosition, sections, formConfig]);

  const publicHref = path || item?.path || "";

  if (loading) {
    return <div className="crm-skeleton" style={{ height: 280 }} />;
  }
  if (!item) {
    return <CrmAlert tone="danger">{error || "랜딩을 찾을 수 없습니다."}</CrmAlert>;
  }

  return (
    <div className="crm-landing-editor">
      <CrmPageHeader
        title="랜딩 편집"
        description={dirty ? "저장되지 않은 변경사항이 있습니다." : undefined}
        actions={
          <Link
            href="/admin/landings"
            className="crm-ui-btn crm-ui-btn-ghost crm-ui-btn-md"
            onClick={(e) => {
              if (!confirmLeave()) e.preventDefault();
            }}
          >
            목록
          </Link>
        }
        meta={
          msg || error ? (
            <div style={{ display: "grid", gap: 8 }}>
              {msg ? <CrmAlert tone="success">{msg}</CrmAlert> : null}
              {error ? <CrmAlert tone="danger">{error}</CrmAlert> : null}
            </div>
          ) : null
        }
      />

      <div className="crm-landing-editor-grid">
        <div className="crm-landing-settings">
          <EditorAccordion title="기본 정보" defaultOpen>
            <CrmField label="경로">
              <CrmInput value={path} onChange={(e) => setPath(e.target.value)} />
            </CrmField>
            <CrmField label="제목">
              <CrmInput value={title} onChange={(e) => setTitle(e.target.value)} />
            </CrmField>
            <CrmField label="커스텀 호스트" hint="선택 사항">
              <CrmInput
                value={customHost}
                onChange={(e) => setCustomHost(e.target.value)}
                placeholder="promo.example.com"
              />
            </CrmField>
          </EditorAccordion>

          <EditorAccordion title="이미지 및 버튼" defaultOpen>
            <AssetField
              label="상단 이미지"
              value={hero1}
              onChange={setHero1}
              accept="image/*"
              kind="image"
            />
            <AssetField
              label="하단 이미지"
              value={hero2}
              onChange={setHero2}
              accept="image/*"
              kind="image"
            />

            <CrmCheckbox
              checked={showBrochure}
              onChange={setShowBrochure}
              label="브로셔 다운로드 버튼 사용"
            />
            {showBrochure ? (
              <AssetField
                label="브로셔 파일"
                value={brochureUrl}
                onChange={setBrochureUrl}
                accept=".pdf,application/pdf"
                kind="file"
              />
            ) : null}

            <CrmField label="상담 신청 버튼 위치">
              <CrmSelect
                value={ctaPosition}
                onChange={(e) => setCtaPosition(e.target.value as ManagedCtaPosition)}
              >
                <option value="always">전체 구간에서 노출</option>
                <option value="from_bottom">하단 이미지 시작부터 노출</option>
                <option value="after_bottom">하단 이미지가 끝난 다음 노출</option>
              </CrmSelect>
            </CrmField>
          </EditorAccordion>

          <EditorAccordion title="신청폼 설정" defaultOpen>
            <p className="crm-ui-hint" style={{ margin: 0 }}>
              체크 해제한 항목은 고객 상담폼에 노출·필수 검증되지 않습니다. 저장 후 공개 페이지에
              반영됩니다.
            </p>

            <CrmCheckbox
              checked={formConfig.includeRegion}
              onChange={(v) => setFormConfig((c) => ({ ...c, includeRegion: v }))}
              label="지역 필드 포함"
            />

            {formConfig.includeRegion ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div className="crm-landing-region-toolbar">
                  <strong style={{ fontSize: 13 }}>노출할 지역 · 권역별 선택</strong>
                  <span style={{ display: "flex", gap: 6 }}>
                    <CrmButton
                      type="button"
                      size="sm"
                      onClick={() =>
                        setFormConfig((c) => ({ ...c, allowedRegions: [...BASE_REGIONS] }))
                      }
                    >
                      전체 선택
                    </CrmButton>
                    <CrmButton
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setFormConfig((c) => ({ ...c, allowedRegions: [] }))}
                    >
                      전체 해제
                    </CrmButton>
                  </span>
                </div>

                {REGION_GROUPS.map((g) => {
                  const selectedCount = g.regions.filter((r) =>
                    formConfig.allowedRegions.includes(r)
                  ).length;
                  const allOn = selectedCount === g.regions.length;
                  return (
                    <div key={g.zone} className="crm-landing-region-zone">
                      <div className="crm-landing-region-zone-head">
                        <span>
                          {g.zone} ({selectedCount}/{g.regions.length})
                        </span>
                        <span style={{ display: "flex", gap: 4 }}>
                          <CrmButton
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleZone(g.regions, true)}
                            disabled={allOn}
                          >
                            선택
                          </CrmButton>
                          <CrmButton
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleZone(g.regions, false)}
                            disabled={selectedCount === 0}
                          >
                            해제
                          </CrmButton>
                        </span>
                      </div>
                      <div className="crm-landing-region-zone-body">
                        {g.regions.map((r) => (
                          <CrmCheckbox
                            key={r}
                            checked={formConfig.allowedRegions.includes(r)}
                            onChange={() => toggleRegion(r)}
                            label={r}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {formConfig.allowedRegions.length === 0 ? (
                  <p className="crm-ui-error">
                    하나 이상 선택하세요. (미선택 시 상담폼에 전체 지역이 표시됩니다)
                  </p>
                ) : null}
              </div>
            ) : null}

            <CrmCheckbox
              checked={formConfig.allowRegionDetail}
              disabled={!formConfig.includeRegion}
              onChange={(v) => setFormConfig((c) => ({ ...c, allowRegionDetail: v }))}
              label="지역 상세(구/시) 필수 입력"
            />
            <CrmCheckbox
              checked={formConfig.includeAvailableTime}
              onChange={(v) => setFormConfig((c) => ({ ...c, includeAvailableTime: v }))}
              label="상담가능시간 필드 포함"
            />
            <CrmCheckbox
              checked={formConfig.includeAgeGroup}
              onChange={(v) => setFormConfig((c) => ({ ...c, includeAgeGroup: v }))}
              label="연령대 필드 포함"
            />
            <CrmCheckbox
              checked={formConfig.includeJob}
              onChange={(v) => setFormConfig((c) => ({ ...c, includeJob: v }))}
              label="직업/직급 필드 포함"
            />
          </EditorAccordion>

          <EditorAccordion title="공개 설정" defaultOpen>
            <div className="crm-landing-publish-row">
              <div style={{ display: "grid", gap: 6 }}>
                <strong style={{ fontSize: 13 }}>공개 여부</strong>
                <CrmBadge tone={published ? "success" : "neutral"}>
                  {published ? "공개 중" : "비공개"}
                </CrmBadge>
              </div>
              <CrmSwitch checked={published} onChange={setPublished} label={published ? "공개" : "비공개"} />
            </div>
            <p className="crm-ui-hint" style={{ margin: 0 }}>
              공개 URL: <span title={publicHref}>{publicHref}</span>
            </p>
          </EditorAccordion>

          <EditorAccordion title="스크롤 히트맵 구간" defaultOpen={false}>
            <p className="crm-ui-hint" style={{ margin: 0 }}>
              미리보기 <strong>최상단=0</strong> 기준입니다. 원하는 위치까지 스크롤한 뒤 「시작점
              찍기」를 누르면 <strong>이전 구간 끝 ~ 현재 화면 상단</strong>이 한 구간으로
              추가됩니다.
            </p>
            <div className="crm-landing-mono">
              현재 화면 상단 y_ratio: <strong>{yHint}</strong>
              {sections.length > 0 ? (
                <span>
                  {" "}
                  · 다음 시작 {formatYRatio(Math.max(...sections.map((s) => s.end)))}
                </span>
              ) : null}
            </div>
            <CrmField label="구간 이름">
              <CrmInput
                value={sectionLabel}
                onChange={(e) => setSectionLabel(e.target.value)}
                placeholder="예: 1. 메인 후킹"
              />
            </CrmField>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <CrmButton type="button" size="sm" onClick={markSectionPoint}>
                시작점 찍기
              </CrmButton>
              <CrmButton type="button" size="sm" onClick={closeLastSectionToEnd}>
                끝까지 마감
              </CrmButton>
              <CrmButton
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSections([]);
                  setMsg("구간을 초기화했습니다.");
                }}
              >
                구간 초기화
              </CrmButton>
              <CrmButton
                type="button"
                size="sm"
                variant="secondary"
                disabled={saving}
                onClick={() => void save({ sections } as never)}
              >
                구간만 저장
              </CrmButton>
            </div>
            <ul className="crm-landing-section-list">
              {sections.map((s) => (
                <li key={s.name + s.start}>
                  <span>
                    {s.label}: {formatYRatio(s.start)}–{formatYRatio(s.end)}
                  </span>
                  <CrmButton
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setSections((prev) => prev.filter((x) => x !== s))}
                  >
                    삭제
                  </CrmButton>
                </li>
              ))}
            </ul>
          </EditorAccordion>
        </div>

        <aside className="crm-landing-preview-col">
          <div className="crm-landing-preview-toolbar">
            <CrmButton
              type="button"
              size="sm"
              className={previewMode === "mobile" ? "is-active" : ""}
              onClick={() => setPreviewMode("mobile")}
            >
              모바일
            </CrmButton>
            <CrmButton
              type="button"
              size="sm"
              className={previewMode === "desktop" ? "is-active" : ""}
              onClick={() => setPreviewMode("desktop")}
            >
              데스크톱
            </CrmButton>
            <a
              href={publicHref || "#"}
              target="_blank"
              rel="noreferrer"
              className="crm-ui-btn crm-ui-btn-ghost crm-ui-btn-sm"
              onClick={(e) => {
                if (!publicHref) e.preventDefault();
              }}
            >
              새 탭에서 보기
            </a>
          </div>

          <div className="crm-landing-preview-frame-wrap">
            <div
              className={`crm-landing-preview-frame${previewMode === "mobile" ? " is-mobile" : ""}`}
            >
              <div className="crm-landing-preview-chrome">
                <span title={publicHref}>미리보기 · {publicHref || item.path}</span>
                <CrmBadge tone={published ? "success" : "neutral"}>
                  {published ? "공개" : "비공개"}
                </CrmBadge>
              </div>
              <div ref={previewScrollRef} className="crm-landing-preview-scroll">
                {previewProps ? (
                  <ManagedLandingPage
                    key={`${previewProps.hero1Url}|${previewProps.hero2Url}|${previewProps.showBrochure}|${previewProps.brochureUrl ?? ""}|${previewProps.ctaPosition}|${JSON.stringify(previewProps.formConfig)}`}
                    {...previewProps}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div className="crm-landing-editor-footer">
        <div className="crm-landing-editor-footer-inner">
          <CrmButton type="button" variant="ghost" disabled={saving || !dirty} onClick={cancelChanges}>
            변경 취소
          </CrmButton>
          <CrmButton type="button" variant="secondary" disabled={saving} onClick={() => void save()}>
            {saving ? "저장 중…" : "저장"}
          </CrmButton>
          <CrmButton
            type="button"
            variant="primary"
            disabled={saving}
            onClick={() => {
              setPublished(true);
              void save({ published: true });
            }}
          >
            저장 후 공개
          </CrmButton>
        </div>
      </div>
    </div>
  );
}
