"use client";

import { useEffect, useMemo, useState } from "react";
import DateRangePicker from "@/app/admin/_components/crm/DateRangePicker";
import { CrmStatRow } from "@/app/admin/_components/crm/ui";
import { addDaysLocal, todayYmdLocal } from "@/lib/crm/ui";

type Row = {
  staff_id: string;
  staff_name: string;
  rank: string;
  assigned: number;
  first_contact: number;
  first_contact_rate: number | null;
};

type Summary = {
  inbound: number;
  contacted: number;
  rate: number | null;
};

type SortMode = "rate_desc" | "rate_asc" | "pending_desc";

type RateTone = "ok" | "warn" | "alert" | "zero";

function rateTone(rate: number | null): RateTone {
  if (rate == null) return "ok";
  if (rate <= 0) return "zero";
  if (rate < 70) return "alert";
  if (rate < 90) return "warn";
  return "ok";
}

function toneLabel(tone: RateTone): string | null {
  if (tone === "zero") return "미컨택";
  if (tone === "alert") return "관리 필요";
  if (tone === "warn") return "주의";
  return null;
}

export default function DashboardPage() {
  const t = todayYmdLocal();
  const [from, setFrom] = useState(() => addDaysLocal(t, -3));
  const [to, setTo] = useState(t);
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary>({ inbound: 0, contacted: 0, rate: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("pending_desc");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/admin/dashboard?date_from=${from}&date_to=${to}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.ok) {
          setRows(d.by_person ?? []);
          setSummary({
            inbound: Number(d.summary?.inbound ?? 0),
            contacted: Number(d.summary?.contacted ?? 0),
            rate: d.summary?.rate == null ? null : Number(d.summary.rate),
          });
        } else setError(d.message || "조회 실패");
      })
      .catch(() => {
        if (!cancelled) setError("네트워크 오류");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const chartRows = useMemo(() => {
    const list = rows.filter((r) => r.assigned > 0);
    list.sort((a, b) => {
      const ar = a.first_contact_rate ?? -1;
      const br = b.first_contact_rate ?? -1;
      const ap = Math.max(0, a.assigned - a.first_contact);
      const bp = Math.max(0, b.assigned - b.first_contact);
      if (sortMode === "pending_desc") {
        if (ap !== bp) return bp - ap;
        if (ar !== br) return ar - br;
      } else if (ar !== br) {
        return sortMode === "rate_desc" ? br - ar : ar - br;
      }
      if (a.assigned !== b.assigned) return b.assigned - a.assigned;
      return a.staff_name.localeCompare(b.staff_name, "ko");
    });
    return list;
  }, [rows, sortMode]);

  const attentionCount = useMemo(
    () => chartRows.filter((r) => rateTone(r.first_contact_rate) !== "ok").length,
    [chartRows]
  );

  return (
    <div>
      <h1 className="crm-page-title">대시보드</h1>
      <p className="crm-page-desc">영업자별 1차컨택률을 일자 구간으로 조회합니다.</p>
      <div className="crm-toolbar">
        <DateRangePicker
          from={from}
          to={to}
          onChange={(f, t2) => {
            setFrom(f || t);
            setTo(t2 || t);
          }}
        />
      </div>

      {error ? (
        <div className="crm-empty" role="alert">
          <strong>오류</strong>
          {error}
        </div>
      ) : loading && rows.length === 0 ? (
        <div className="crm-skeleton" style={{ height: 280, marginTop: 16 }} />
      ) : (
        <>
          {loading ? (
            <div className="crm-dash-loading" aria-live="polite" style={{ marginTop: 8, fontSize: 12, color: "var(--crm-muted)" }}>
              갱신 중…
            </div>
          ) : null}
          <div className="crm-dash-stats" style={{ marginTop: 16 }}>
            <CrmStatRow
              items={[
                { label: "신규 유입", value: summary.inbound.toLocaleString() },
                { label: "1차컨택완료", value: summary.contacted.toLocaleString() },
                {
                  label: "1차컨택완료률",
                  value: summary.rate == null ? "-" : `${summary.rate}%`,
                },
              ]}
            />
          </div>

          <section className="crm-dash-chart" aria-label="영업자별 1차 컨택률">
            <div className="crm-dash-chart-head">
              <div>
                <h2 className="crm-dash-chart-title">영업자별 1차 컨택률</h2>
                {chartRows.length > 0 ? (
                  <p className="crm-dash-chart-sub">
                    {attentionCount > 0
                      ? `주의·관리 필요 ${attentionCount}명 · 전체 ${chartRows.length}명`
                      : `전체 ${chartRows.length}명 · 이상 없음`}
                  </p>
                ) : null}
              </div>
              <div className="crm-dash-sort" role="group" aria-label="정렬">
                <button
                  type="button"
                  className={`crm-btn${sortMode === "pending_desc" ? " crm-btn-primary" : ""}`}
                  onClick={() => setSortMode("pending_desc")}
                >
                  미완료 많은 순
                </button>
                <button
                  type="button"
                  className={`crm-btn${sortMode === "rate_asc" ? " crm-btn-primary" : ""}`}
                  onClick={() => setSortMode("rate_asc")}
                >
                  낮은 순
                </button>
                <button
                  type="button"
                  className={`crm-btn${sortMode === "rate_desc" ? " crm-btn-primary" : ""}`}
                  onClick={() => setSortMode("rate_desc")}
                >
                  높은 순
                </button>
              </div>
            </div>

            {chartRows.length === 0 ? (
              <div className="crm-empty" style={{ border: "none", padding: "20px 0" }}>
                배정 건수가 있는 영업자가 없습니다.
              </div>
            ) : (
              <div className="crm-dash-table-wrap">
                <table className="crm-dash-table">
                  <thead>
                    <tr>
                      <th scope="col">영업자</th>
                      <th scope="col" className="crm-dash-num">
                        완료/전체
                      </th>
                      <th scope="col" className="crm-dash-num">
                        미완료
                      </th>
                      <th scope="col" className="crm-dash-num">
                        완료율
                      </th>
                      <th scope="col" className="crm-dash-progress-col">
                        Progress
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartRows.map((r) => {
                      const rate = r.first_contact_rate ?? 0;
                      const pending = Math.max(0, r.assigned - r.first_contact);
                      const tone = rateTone(r.first_contact_rate);
                      const badge = toneLabel(tone);
                      return (
                        <tr key={r.staff_id} className={`crm-dash-row crm-dash-row-${tone}`}>
                          <td>
                            <span className="crm-dash-bar-name">
                              {r.staff_name}
                              {r.rank === "manager" ? <span className="crm-dash-rank-tag">매니저</span> : null}
                              {badge ? <span className={`crm-dash-tone-tag crm-dash-tone-tag-${tone}`}>{badge}</span> : null}
                            </span>
                          </td>
                          <td className="crm-dash-num">
                            {r.first_contact.toLocaleString()}/{r.assigned.toLocaleString()}
                          </td>
                          <td className={`crm-dash-num${pending > 0 ? " crm-dash-pending" : ""}`}>
                            {pending.toLocaleString()}
                          </td>
                          <td className={`crm-dash-num crm-dash-rate crm-dash-rate-${tone}`}>
                            {r.first_contact_rate == null ? "-" : `${rate}%`}
                          </td>
                          <td className="crm-dash-progress-col">
                            <div
                              className="crm-dash-mini-track"
                              role="progressbar"
                              aria-valuenow={rate}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label={`${r.staff_name} 완료율 ${rate}%`}
                            >
                              <div
                                className={`crm-dash-mini-fill crm-dash-mini-fill-${tone}`}
                                style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
