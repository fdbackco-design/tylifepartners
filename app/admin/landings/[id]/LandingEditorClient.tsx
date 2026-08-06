"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ManagedLandingPage from "@/app/_components/ManagedLandingPage";
import { formatYRatio, yRatio } from "@/lib/landingScrollMetrics";
import type {
  ManagedCtaPosition,
  ManagedFormConfig,
  ManagedLandingRow,
  ManagedLandingSection,
} from "@/lib/managedLandings/types";
import { DEFAULT_FORM_CONFIG } from "@/lib/managedLandings/formConfig";

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

export default function AdminLandingEditor({ landingId }: { landingId: string }) {
  const [item, setItem] = useState<ManagedLandingRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

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
      const it = json.item as ManagedLandingRow;
      setItem(it);
      setPath(it.path);
      setTitle(it.title);
      setCustomHost(it.custom_host ?? "");
      setHero1(it.hero1_url);
      setHero2(it.hero2_url);
      setShowBrochure(it.show_brochure);
      setBrochureUrl(it.brochure_url ?? "");
      setCtaPosition(it.cta_position);
      setPublished(it.published);
      setFormConfig(it.form_config ?? DEFAULT_FORM_CONFIG);
      setSections(it.sections ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [landingId]);

  useEffect(() => {
    void load();
  }, [load]);

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
  }, [readPreviewTopRatio, item, hero1, hero2]);

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
        return;
      }
      const it = json.item as ManagedLandingRow;
      setItem(it);
      setPath(it.path);
      setSections(it.sections ?? []);
      setMsg("저장되었습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const markSectionPoint = () => {
    const end = readPreviewTopRatio();
    const prevEnd =
      sections.length > 0 ? Math.max(...sections.map((s) => s.end)) : 0;
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
    const prevEnd =
      sections.length > 0 ? Math.max(...sections.map((s) => s.end)) : 0;
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

  if (loading) return <main style={{ padding: 24 }}>불러오는 중…</main>;
  if (!item) return <main style={{ padding: 24 }}>{error || "없음"}</main>;

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 12px 80px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>랜딩 편집</h1>
        <Link href="/admin/landings">목록</Link>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(280px, 360px) 1fr",
          gap: 16,
          marginTop: 16,
          alignItems: "start",
        }}
        className="admin-landing-grid"
      >
        <section
          style={{
            padding: 14,
            border: "1px solid #e9ecef",
            borderRadius: 12,
            background: "#fff",
            position: "sticky",
            top: 12,
          }}
        >
          <Field label="경로">
            <input value={path} onChange={(e) => setPath(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="제목">
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="커스텀 호스트 (선택)">
            <input
              value={customHost}
              onChange={(e) => setCustomHost(e.target.value)}
              placeholder="promo.example.com"
              style={inputStyle}
            />
          </Field>
          <Field label="상단 이미지 URL">
            <input value={hero1} onChange={(e) => setHero1(e.target.value)} style={inputStyle} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
              <FileUpload onUploaded={setHero1} accept="image/*" />
              {hero1.trim() ? (
                <button type="button" onClick={() => setHero1("")} style={btnSecondary}>
                  비우기
                </button>
              ) : null}
            </div>
          </Field>
          <Field label="하단 이미지 URL">
            <input value={hero2} onChange={(e) => setHero2(e.target.value)} style={inputStyle} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
              <FileUpload onUploaded={setHero2} accept="image/*" />
              {hero2.trim() ? (
                <button type="button" onClick={() => setHero2("")} style={btnSecondary}>
                  비우기
                </button>
              ) : null}
            </div>
          </Field>

          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={showBrochure}
              onChange={(e) => setShowBrochure(e.target.checked)}
            />
            브로셔 다운로드 버튼 사용
          </label>
          {showBrochure && (
            <Field label="브로셔 파일 URL">
              <input
                value={brochureUrl}
                onChange={(e) => setBrochureUrl(e.target.value)}
                style={inputStyle}
              />
              <FileUpload onUploaded={setBrochureUrl} accept=".pdf,application/pdf" />
            </Field>
          )}

          <Field label="상담 신청 버튼 위치">
            <select
              value={ctaPosition}
              onChange={(e) => setCtaPosition(e.target.value as ManagedCtaPosition)}
              style={inputStyle}
            >
              <option value="always">전체 구간에서 노출</option>
              <option value="from_bottom">하단 이미지 시작부터 노출</option>
              <option value="after_bottom">하단 이미지가 끝난 다음 노출</option>
            </select>
          </Field>

          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
            />
            공개 (게시)
          </label>

          <hr style={{ margin: "18px 0", border: 0, borderTop: "1px solid #eee" }} />
          <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>신청폼 양식</h3>

          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={formConfig.includeAvailableTime}
              onChange={(e) =>
                setFormConfig((c) => ({ ...c, includeAvailableTime: e.target.checked }))
              }
            />
            상담가능시간 필드 포함
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={formConfig.allowRegionDetail}
              onChange={(e) =>
                setFormConfig((c) => ({ ...c, allowRegionDetail: e.target.checked }))
              }
            />
            지역 상세 필수 입력
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={formConfig.includeAgeGroup}
              onChange={(e) =>
                setFormConfig((c) => ({ ...c, includeAgeGroup: e.target.checked }))
              }
            />
            연령대 필드 포함
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={formConfig.includeJob}
              onChange={(e) =>
                setFormConfig((c) => ({ ...c, includeJob: e.target.checked }))
              }
            />
            직업/직급 필드 포함
          </label>

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            style={{
              marginTop: 14,
              width: "100%",
              padding: "12px 14px",
              background: "var(--cta-bg, #f76707)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {saving ? "저장 중…" : "설정 저장"}
          </button>

          <hr style={{ margin: "18px 0", border: 0, borderTop: "1px solid #eee" }} />

          <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>스크롤 히트맵 구간</h3>
          <p style={{ margin: "0 0 8px", fontSize: 12, color: "#868e96" }}>
            미리보기 <strong>최상단=0</strong> 기준입니다. 원하는 위치까지 스크롤한 뒤
            「시작점 찍기」를 누르면 <strong>이전 구간 끝 ~ 현재 화면 상단</strong>이
            한 구간으로 추가됩니다.
          </p>
          <div style={{ fontFamily: "monospace", fontSize: 12, marginBottom: 8 }}>
            현재 화면 상단 y_ratio: <strong>{yHint}</strong>
            {sections.length > 0 && (
              <span style={{ color: "#868e96" }}>
                {" "}
                · 다음 시작 {formatYRatio(Math.max(...sections.map((s) => s.end)))}
              </span>
            )}
          </div>
          <input
            value={sectionLabel}
            onChange={(e) => setSectionLabel(e.target.value)}
            placeholder="구간 이름 (예: 1. 메인 후킹)"
            style={{ ...inputStyle, marginBottom: 8 }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" onClick={markSectionPoint} style={btnSecondary}>
              시작점 찍기
            </button>
            <button type="button" onClick={closeLastSectionToEnd} style={btnSecondary}>
              끝까지 마감
            </button>
            <button
              type="button"
              onClick={() => {
                setSections([]);
                setMsg("구간을 초기화했습니다.");
              }}
              style={btnSecondary}
            >
              구간 초기화
            </button>
          </div>
          <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12 }}>
            {sections.map((s) => (
              <li key={s.name + s.start}>
                {s.label}: {formatYRatio(s.start)}–{formatYRatio(s.end)}
                <button
                  type="button"
                  onClick={() => setSections((prev) => prev.filter((x) => x !== s))}
                  style={{ marginLeft: 6, border: "none", background: "none", color: "#c92a2a", cursor: "pointer" }}
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void save({ sections } as never)}
            disabled={saving}
            style={{ ...btnSecondary, marginTop: 10, width: "100%" }}
          >
            구간만 저장
          </button>

          {msg && <p style={{ color: "#2b8a3e", fontSize: 13 }}>{msg}</p>}
          {error && <p style={{ color: "#c92a2a", fontSize: 13 }}>{error}</p>}
        </section>

        <section
          style={{
            border: "1px solid #e9ecef",
            borderRadius: 12,
            overflow: "hidden",
            background: "#f8f9fa",
            maxWidth: 480,
            margin: "0 auto",
            width: "100%",
          }}
        >
          <div
            style={{
              padding: "8px 12px",
              background: "#212529",
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            미리보기 (관리자 전용 구간 측정) · 공개 URL: {path || item.path}
          </div>
          <div
            ref={previewScrollRef}
            style={{ maxHeight: "80vh", overflow: "auto", background: "#fff" }}
          >
            {previewProps && (
              <ManagedLandingPage
                key={`${previewProps.hero1Url}|${previewProps.hero2Url}|${previewProps.showBrochure}|${previewProps.brochureUrl ?? ""}|${previewProps.ctaPosition}`}
                {...previewProps}
              />
            )}
          </div>
        </section>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .admin-landing-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginTop: 10, fontSize: 13 }}>
      <span style={{ display: "block", marginBottom: 4, color: "#495057", fontWeight: 600 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function FileUpload({
  onUploaded,
  accept,
}: {
  onUploaded: (url: string) => void;
  accept: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <input
      type="file"
      accept={accept}
      disabled={busy}
      style={{ marginTop: 6, fontSize: 12 }}
      onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setBusy(true);
        try {
          const url = await uploadFile(file);
          onUploaded(url);
        } catch (err) {
          alert(err instanceof Error ? err.message : String(err));
        } finally {
          setBusy(false);
          e.target.value = "";
        }
      }}
    />
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  fontSize: 14,
  borderRadius: 8,
  border: "1px solid #ced4da",
};

const btnSecondary: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid #ced4da",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 600,
};
