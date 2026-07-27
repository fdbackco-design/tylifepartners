"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ManagedLandingPage from "@/app/_components/ManagedLandingPage";
import {
  computeLandingScrollMetrics,
  formatYRatio,
} from "@/lib/landingScrollMetrics";
import type {
  ManagedCtaPosition,
  ManagedLandingRow,
  ManagedLandingSection,
} from "@/lib/managedLandings/types";

async function uploadFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/admin/landings/upload", { method: "POST", body: fd });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "업로드 실패");
  return json.url as string;
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
  const [sections, setSections] = useState<ManagedLandingSection[]>([]);
  const [sectionLabel, setSectionLabel] = useState("");
  const [pendingStart, setPendingStart] = useState<number | null>(null);
  const [yHint, setYHint] = useState("0.0000");

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

  useEffect(() => {
    const refresh = () => {
      const m = computeLandingScrollMetrics();
      setYHint(formatYRatio(m.yRatioCenter));
    };
    refresh();
    window.addEventListener("scroll", refresh, { passive: true });
    window.addEventListener("resize", refresh, { passive: true });
    return () => {
      window.removeEventListener("scroll", refresh);
      window.removeEventListener("resize", refresh);
    };
  }, []);

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
    const y = Number(yHint);
    if (!Number.isFinite(y)) return;
    if (pendingStart == null) {
      setPendingStart(y);
      setMsg(`구간 시작점 기록: ${formatYRatio(y)}. 끝점에서 다시 눌러주세요.`);
      return;
    }
    const start = Math.min(pendingStart, y);
    const end = Math.max(pendingStart, y);
    const idx = sections.length + 1;
    const next: ManagedLandingSection = {
      name: `section_${String(idx).padStart(2, "0")}`,
      label: sectionLabel.trim() || `${idx}. 구간`,
      start,
      end,
    };
    setSections((prev) => [...prev, next].sort((a, b) => a.start - b.start));
    setPendingStart(null);
    setSectionLabel("");
    setMsg(`구간 추가: ${next.label} (${formatYRatio(start)}–${formatYRatio(end)})`);
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
      previewMode: true as const,
    };
  }, [item, path, title, hero1, hero2, showBrochure, brochureUrl, ctaPosition, sections]);

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
            <FileUpload onUploaded={setHero1} accept="image/*" />
          </Field>
          <Field label="하단 이미지 URL">
            <input value={hero2} onChange={(e) => setHero2(e.target.value)} style={inputStyle} />
            <FileUpload onUploaded={setHero2} accept="image/*" />
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
            오른쪽 미리보기를 스크롤하며 중앙 y_ratio로 구간을 찍습니다. (관리자 전용)
          </p>
          <div style={{ fontFamily: "monospace", fontSize: 12, marginBottom: 8 }}>
            현재 중앙 y_ratio: <strong>{yHint}</strong>
            {pendingStart != null && (
              <span style={{ color: "#e67700" }}> · 시작 {formatYRatio(pendingStart)}</span>
            )}
          </div>
          <input
            value={sectionLabel}
            onChange={(e) => setSectionLabel(e.target.value)}
            placeholder="구간 이름 (예: 1. 메인 후킹)"
            style={{ ...inputStyle, marginBottom: 8 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={markSectionPoint} style={btnSecondary}>
              {pendingStart == null ? "시작점 찍기" : "끝점 찍고 추가"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingStart(null);
                setSections([]);
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
          <div style={{ maxHeight: "80vh", overflow: "auto", background: "#fff" }}>
            {previewProps && <ManagedLandingPage {...previewProps} />}
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
