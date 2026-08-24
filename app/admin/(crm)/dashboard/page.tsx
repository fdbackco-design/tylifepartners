"use client";

import { useEffect, useState } from "react";
import DateRangePicker from "@/app/admin/_components/crm/DateRangePicker";
import { todayYmdLocal } from "@/lib/crm/ui";

type Row = {
  staff_id: string;
  staff_name: string;
  rank: string;
  assigned: number;
  first_contact: number;
  first_contact_rate: number | null;
};

export default function DashboardPage() {
  const t = todayYmdLocal();
  const [from, setFrom] = useState(t);
  const [to, setTo] = useState(t);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`/api/admin/dashboard?date_from=${from}&date_to=${to}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setRows(d.by_person ?? []);
        else setError(d.message || "조회 실패");
      })
      .catch(() => setError("네트워크 오류"))
      .finally(() => setLoading(false));
  }, [from, to]);

  return (
    <div>
      <h1 className="crm-page-title">대시보드</h1>
      <p className="crm-page-desc">영업자별 1차컨택률을 일자 구간으로 조회합니다.</p>
      <div className="crm-toolbar">
        <DateRangePicker from={from} to={to} onChange={(f, t2) => { setFrom(f || t); setTo(t2 || t); }} />
      </div>
      {error ? (
        <div className="crm-empty" role="alert"><strong>오류</strong>{error}</div>
      ) : loading ? (
        <div className="crm-skeleton" style={{ height: 240, marginTop: 16 }} />
      ) : (
        <div className="crm-table-shell" style={{ marginTop: 16, maxHeight: "none" }}>
          <table className="crm-table" style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th>영업자</th>
                <th>직급</th>
                <th>배정 건수</th>
                <th>1차컨택</th>
                <th>1차컨택률</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.staff_id}>
                  <td>{r.staff_name}</td>
                  <td>{r.rank === "manager" ? "매니저" : "영업자"}</td>
                  <td>{r.assigned}</td>
                  <td>{r.first_contact}</td>
                  <td>{r.first_contact_rate == null ? "-" : `${r.first_contact_rate}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="crm-empty" style={{ border: "none" }}>표시할 데이터가 없습니다.</div>}
        </div>
      )}
    </div>
  );
}
