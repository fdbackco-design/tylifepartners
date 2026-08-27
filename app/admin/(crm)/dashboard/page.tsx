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

type SortMode = "rate_desc" | "rate_asc";

export default function DashboardPage() {
  const t = todayYmdLocal();
  const [from, setFrom] = useState(() => addDaysLocal(t, -6));
  const [to, setTo] = useState(t);
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary>({ inbound: 0, contacted: 0, rate: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("rate_desc");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`/api/admin/dashboard?date_from=${from}&date_to=${to}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setRows(d.by_person ?? []);
          setSummary({
            inbound: Number(d.summary?.inbound ?? 0),
            contacted: Number(d.summary?.contacted ?? 0),
            rate: d.summary?.rate == null ? null : Number(d.summary.rate),
          });
        } else setError(d.message || "조회 실패");
      })
      .catch(() => setError("네트워크 오류"))
      .finally(() => setLoading(false));
  }, [from, to]);

  const chartRows = useMemo(() => {
    const list = rows.filter((r) => r.assigned > 0);
    list.sort((a, b) => {
      const ar = a.first_contact_rate ?? -1;
      const br = b.first_contact_rate ?? -1;
      if (ar !== br) return sortMode === "rate_desc" ? br - ar : ar - br;
      if (a.assigned !== b.assigned) return b.assigned - a.assigned;
      return a.staff_name.localeCompare(b.staff_name, "ko");
    });
    return list;
  }, [rows, sortMode]);

  const maxRate = useMemo(
    () => Math.max(100, ...chartRows.map((r) => r.first_contact_rate ?? 0)),
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
      ) : loading ? (
        <div className="crm-skeleton" style={{ height: 280, marginTop: 16 }} />
      ) : (
        <>
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

          <section className="crm-dash-chart" aria-label="영업자별 1차 컨택률 그래프">
            <div className="crm-dash-chart-head">
              <h2 className="crm-dash-chart-title">영업자별 1차 컨택률</h2>
              <div className="crm-dash-sort" role="group" aria-label="정렬">
                <button
                  type="button"
                  className={`crm-btn${sortMode === "rate_desc" ? " crm-btn-primary" : ""}`}
                  onClick={() => setSortMode("rate_desc")}
                >
                  높은 순
                </button>
                <button
                  type="button"
                  className={`crm-btn${sortMode === "rate_asc" ? " crm-btn-primary" : ""}`}
                  onClick={() => setSortMode("rate_asc")}
                >
                  낮은 순
                </button>
              </div>
            </div>

            {chartRows.length === 0 ? (
              <div className="crm-empty" style={{ border: "none", padding: "20px 0" }}>
                배정 건수가 있는 영업자가 없습니다.
              </div>
            ) : (
              <ul className="crm-dash-bars">
                {chartRows.map((r) => {
                  const rate = r.first_contact_rate ?? 0;
                  const widthPct = Math.min(100, (rate / maxRate) * 100);
                  return (
                    <li key={r.staff_id} className="crm-dash-bar-row">
                      <div className="crm-dash-bar-meta">
                        <span className="crm-dash-bar-stats">
                          <span className="crm-dash-bar-name">
                            {r.staff_name}
                            {r.rank === "manager" && (
                              <span className="crm-dash-rank-tag">매니저</span>
                            )}
                          </span>
                          <strong>{rate}%</strong>
                          <span>
                            {r.first_contact.toLocaleString()} / {r.assigned.toLocaleString()}
                          </span>
                        </span>
                      </div>
                      <div className="crm-dash-bar-track" aria-hidden>
                        <div className="crm-dash-bar-fill" style={{ width: `${widthPct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
