"use client";

import { useCallback, useEffect, useState } from "react";
import type { LeadBehaviorReport, LeadBehaviorSessionSummary } from "@/lib/landing-analytics/leadBehavior";
import { formatPhoneKorean } from "@/lib/phone";

type Props = {
  leadId: string;
  category: "consumers" | "candidates";
  customerName: string;
  customerPhone: string;
};

function formatKst(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  } catch {
    return iso;
  }
}

/** 페이지 세로축: 위=상단(0%), 아래=하단(100%). 도달 구간은 위에서부터 채움 */
function ScrollPageViz({ session }: { session: LeadBehaviorSessionSummary }) {
  const max = Math.min(100, Math.max(0, session.max_scroll_depth));
  const ticks = [0, 25, 50, 75, 100];

  return (
    <div className="crm-behavior-page-viz" aria-label="스크롤 도달 시각화">
      <div className="crm-behavior-page-viz-track">
        {/* 도달한 구간: 상단(0%)부터 max%까지 */}
        <div
          className="crm-behavior-page-viz-fill"
          style={{ top: 0, height: `${max}%` }}
          title={`상단부터 ${max}%까지 스크롤`}
        />
        {ticks.map((t) => (
          <span key={t} className="crm-behavior-page-viz-tick" style={{ top: `${t}%` }}>
            <i />
            <em>{t}%</em>
          </span>
        ))}
        {session.scroll_positions.map((p, i) => {
          const pct = Math.min(100, Math.max(0, (p.depth ?? p.y_ratio * 100)));
          return (
            <span
              key={`${p.at}-${i}`}
              className="crm-behavior-page-viz-dot"
              style={{ top: `${pct}%` }}
              title={`스크롤 ${Math.round(pct)}% · ${formatKst(p.at)}`}
            />
          );
        })}
        <span className="crm-behavior-page-viz-max" style={{ top: `${max}%` }}>
          최대 {session.max_scroll_depth}%
        </span>
      </div>
      <div className="crm-behavior-page-viz-labels">
        <span>상단 0%</span>
        <span>하단 100%</span>
      </div>
    </div>
  );
}

export default function LeadBehaviorPanel({ leadId, category, customerName, customerPhone }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [report, setReport] = useState<LeadBehaviorReport | null>(null);
  const [sessionId, setSessionId] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/leads/${encodeURIComponent(leadId)}/behavior?category=${encodeURIComponent(category)}`
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || "조회 실패");
        setReport(null);
        return;
      }
      const r = data.report as LeadBehaviorReport;
      setReport(r);
      setSessionId((prev) => {
        if (prev && r.sessions.some((s) => s.session_id === prev)) return prev;
        return r.sessions[0]?.session_id || "";
      });
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [leadId, category]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = report?.sessions.find((s) => s.session_id === sessionId) || report?.sessions[0] || null;

  return (
    <section className="crm-behavior-panel">
      <div className="crm-behavior-panel-head">
        <strong>행동 분석</strong>
        <span style={{ fontSize: 12, color: "var(--crm-muted)" }}>
          {customerName} · {formatPhoneKorean(customerPhone)}
        </span>
        <button type="button" className="crm-btn" onClick={() => void load()} disabled={loading}>
          새로고침
        </button>
      </div>

      {loading && <p className="crm-behavior-muted">불러오는 중…</p>}
      {error && <p className="crm-behavior-error">{error}</p>}

      {!loading && !error && report && report.sessions.length === 0 && (
        <p className="crm-behavior-muted">
          이 고객에 연결된 방문 세션이 없습니다. 상담 신청 시 세션이 저장된 이후 유입부터 표시됩니다.
        </p>
      )}

      {!loading && report && report.sessions.length > 0 && (
        <>
          <label className="crm-behavior-session-pick">
            방문 세션 ({report.sessions.length})
            <select value={active?.session_id || ""} onChange={(e) => setSessionId(e.target.value)}>
              {report.sessions.map((s, idx) => (
                <option key={s.session_id} value={s.session_id}>
                  #{report.sessions.length - idx} · {formatKst(s.started_at || s.linked_at)} · 최대{" "}
                  {s.max_scroll_depth}%
                </option>
              ))}
            </select>
          </label>

          {active && (
            <div className="crm-behavior-grid">
              <div className="crm-behavior-stats">
                <div>
                  <span>방문 페이지</span>
                  <strong title={active.page_url || ""}>
                    {active.landing_key || active.page_url || "-"}
                  </strong>
                </div>
                <div>
                  <span>최대 스크롤</span>
                  <strong>{active.max_scroll_depth}%</strong>
                </div>
                <div>
                  <span>체류 시간</span>
                  <strong>{active.duration_label}</strong>
                </div>
                <div>
                  <span>상담 신청</span>
                  <strong>{formatKst(active.lead_submit_at)}</strong>
                </div>
              </div>

              <div>
                <h4 className="crm-behavior-sub">스크롤 도달 (페이지 세로)</h4>
                <ScrollPageViz session={active} />
              </div>

              <div>
                <h4 className="crm-behavior-sub">구간별 체류</h4>
                {active.section_dwells.length === 0 ? (
                  <p className="crm-behavior-muted">데이터 없음</p>
                ) : (
                  <ul className="crm-behavior-list">
                    {active.section_dwells.map((d) => (
                      <li key={d.name}>
                        <span>{d.label}</span>
                        <strong>{Math.round(d.seconds)}초</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h4 className="crm-behavior-sub">조회한 섹션</h4>
                {active.sections_viewed.length === 0 ? (
                  <p className="crm-behavior-muted">데이터 없음</p>
                ) : (
                  <div className="crm-behavior-tags">
                    {active.sections_viewed.map((s) => (
                      <span key={s.name}>{s.label}</span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="crm-behavior-sub">CTA 클릭</h4>
                {active.cta_clicks.length === 0 ? (
                  <p className="crm-behavior-muted">기록 없음</p>
                ) : (
                  <ul className="crm-behavior-list">
                    {active.cta_clicks.map((c, i) => (
                      <li key={`${c.at}-${i}`}>
                        <span>
                          {formatKst(c.at)}
                          {c.section_label ? ` · ${c.section_label}` : ""}
                          {c.y_ratio != null ? ` · ${Math.round(c.y_ratio * 100)}%` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
