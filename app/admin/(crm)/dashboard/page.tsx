"use client";

import { useEffect, useState } from "react";

type Row = {
  staff_id: string;
  staff_name: string;
  rank: string;
  assigned: number;
  first_contact: number;
  first_contact_rate: number | null;
};

export default function DashboardPage() {
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/dashboard?date_from=${from}&date_to=${to}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setRows(d.by_person ?? []);
      })
      .finally(() => setLoading(false));
  }, [from, to]);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>대시보드</h1>
      <p style={{ color: "var(--text-secondary)" }}>영업자별 1차컨택률입니다. 기간을 바꿔 조회하세요.</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      {loading ? (
        <div>로딩 중...</div>
      ) : (
        <div className="crm-table-wrap">
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
        </div>
      )}
    </div>
  );
}
