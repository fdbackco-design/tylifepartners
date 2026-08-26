"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { LandingAnalyticsReport } from "@/lib/landing-analytics/aggregate";
import { LANDING_KEY_LABELS } from "@/lib/landing-analytics/sections";
import { formatPhoneKorean } from "@/lib/phone";
import { LandingAnalyticsReportView } from "@/app/admin/landing-analytics/_components/LandingAnalyticsReportView";

type LeadMeta = {
  id: string;
  name: string;
  phone: string;
  entry_page: string | null;
  last_section_name: string | null;
  last_section_label: string | null;
  max_scroll_depth: number | null;
};

type Props = {
  category?: "candidates" | "consumers";
};

export default function CandidateLeadHeatmapPage({ category = "candidates" }: Props) {
  const searchParams = useSearchParams();
  const leadId = searchParams.get("id")?.trim() ?? "";
  const listHref = category === "consumers" ? "/admin/consumers" : "/admin/candidates";
  const listLabel = category === "consumers" ? "소비자 DB" : "후보자 DB";

  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lead, setLead] = useState<LeadMeta | null>(null);
  const [landingKey, setLandingKey] = useState("");
  const [eventCount, setEventCount] = useState(0);
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [landingImages, setLandingImages] = useState<string[]>([]);
  const [report, setReport] = useState<LandingAnalyticsReport | null>(null);

  const checkAuth = useCallback(async () => {
    const res = await fetch(`/api/admin/leads?limit=1&category=${category}`);
    setLoggedIn(res.ok);
  }, [category]);

  const loadReport = useCallback(async () => {
    if (!leadId) {
      setError("고객 ID가 없습니다.");
      setReport(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/leads/${encodeURIComponent(leadId)}/heatmap?category=${category}`
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message ?? "조회 실패");
        setReport(null);
        setLead(null);
        setLandingImages([]);
        return;
      }
      setLead(data.lead);
      setLandingKey(data.landing_key ?? "");
      setEventCount(data.event_count ?? 0);
      setSessionIds(Array.isArray(data.session_ids) ? data.session_ids : []);
      setLandingImages(Array.isArray(data.landing_images) ? data.landing_images.filter(Boolean) : []);
      setReport(data.report);
    } catch {
      setError("네트워크 오류");
      setReport(null);
      setLandingImages([]);
    } finally {
      setLoading(false);
    }
  }, [leadId, category]);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (loggedIn) void loadReport();
  }, [loggedIn, loadReport]);

  if (loggedIn === null) {
    return <main style={{ padding: 24 }}>로딩 중…</main>;
  }

  if (!loggedIn) {
    return (
      <main style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
        <p>관리자 로그인이 필요합니다.</p>
        <Link href="/admin">관리자 로그인으로 이동</Link>
      </main>
    );
  }

  const landingLabel =
    (landingKey && LANDING_KEY_LABELS[landingKey as keyof typeof LANDING_KEY_LABELS]) ||
    landingKey ||
    "-";

  return (
    <main className="crm-lead-heatmap">
      <header className="crm-lead-heatmap-header">
        <div style={{ marginBottom: 10 }}>
          <Link href={listHref} style={{ fontSize: 13, color: "#64748b" }}>
            ← {listLabel}
          </Link>
        </div>
        <h1 style={{ margin: 0, fontSize: 22 }}>고객 스크롤 히트맵</h1>
        {lead && (
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "#475569" }}>
            {lead.name} · {formatPhoneKorean(lead.phone)}
            {lead.entry_page ? ` · ${lead.entry_page}` : ""}
          </p>
        )}
      </header>

      {loading && <p style={{ color: "#64748b" }}>조회 중…</p>}
      {error && <p style={{ color: "#c00" }}>{error}</p>}

      {!loading && !error && lead && (
        <p className="crm-lead-heatmap-meta">
          랜딩 {landingLabel} · 이벤트 {eventCount.toLocaleString()}건 · 세션{" "}
          {sessionIds.length.toLocaleString()}개
          {lead.last_section_label
            ? ` · 신청 시 구간 ${lead.last_section_label}`
            : lead.last_section_name
              ? ` · 신청 시 구간 ${lead.last_section_name}`
              : ""}
          {lead.max_scroll_depth != null ? ` · 최대 스크롤 ${lead.max_scroll_depth}%` : ""}
        </p>
      )}

      {!loading && !error && sessionIds.length === 0 && (
        <p style={{ color: "#b45309", fontSize: 14, marginBottom: 16 }}>
          이 고객과 연결된 랜딩 세션이 없습니다. 상담 신청 시 트래킹이 연결된 이후에 데이터가
          쌓입니다.
        </p>
      )}

      <div className="crm-lead-heatmap-layout">
        <div className="crm-lead-heatmap-main">
          {report && (
            <LandingAnalyticsReportView
              report={report}
              variant="lead"
              submissionCountHint="신청 시 구간: 이 고객이 상담 신청할 때 머물던 구간(1건)."
            />
          )}
        </div>

        {landingImages.length > 0 && (
          <aside className="crm-lead-heatmap-preview" aria-label="랜딩페이지 미리보기">
            <div className="crm-lead-heatmap-preview-head">랜딩 미리보기</div>
            <div className="crm-lead-heatmap-preview-frame">
              <div className="crm-lead-heatmap-preview-scroll">
                {landingImages.map((src) => (
                  <img key={src} src={src} alt="" className="crm-lead-heatmap-preview-img" />
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
