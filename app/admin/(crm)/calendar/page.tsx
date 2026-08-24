"use client";

import { useEffect, useMemo, useState } from "react";

type Meeting = {
  id: string;
  category: string;
  name: string;
  phone: string;
  status: string;
  region: string;
  assignee_id: string | null;
  assignee_name: string;
  meeting_at: string;
  date: string;
};

export default function CalendarPage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [assigneeId, setAssigneeId] = useState("");
  const [items, setItems] = useState<Meeting[]>([]);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams({ month });
    if (assigneeId) sp.set("assignee_id", assigneeId);
    fetch(`/api/admin/calendar?${sp}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setItems(d.items ?? []);
          setStaff(d.staff ?? []);
        }
      });
  }, [month, assigneeId]);

  const days = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const startPad = first.getDay();
    const lastDate = new Date(y, m, 0).getDate();
    const cells: { date: string | null; day: number | null }[] = [];
    for (let i = 0; i < startPad; i += 1) cells.push({ date: null, day: null });
    for (let d = 1; d <= lastDate; d += 1) {
      const date = `${month}-${String(d).padStart(2, "0")}`;
      cells.push({ date, day: d });
    }
    return cells;
  }, [month]);

  const byDate = useMemo(() => {
    const map = new Map<string, Meeting[]>();
    for (const it of items) {
      const list = map.get(it.date) ?? [];
      list.push(it);
      map.set(it.date, list);
    }
    return map;
  }, [items]);

  const selectedItems = selected ? byDate.get(selected) ?? [] : [];

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>캘린더</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
          <option value="">전체 영업자</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 16 }}>
        {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
          <div key={d} style={{ textAlign: "center", fontWeight: 700, fontSize: 13 }}>
            {d}
          </div>
        ))}
        {days.map((c, i) => (
          <button
            key={i}
            type="button"
            disabled={!c.date}
            onClick={() => c.date && setSelected(c.date)}
            style={{
              minHeight: 72,
              border: selected === c.date ? "2px solid var(--cta-bg)" : "1px solid var(--border)",
              background: c.date && (byDate.get(c.date)?.length ?? 0) ? "#e8f5e9" : "#fff",
              borderRadius: 8,
              textAlign: "left",
              padding: 6,
              cursor: c.date ? "pointer" : "default",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700 }}>{c.day ?? ""}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              {c.date ? `${byDate.get(c.date)?.length ?? 0}건` : ""}
            </div>
          </button>
        ))}
      </div>
      {selected && (
        <div className="crm-table-wrap">
          <table className="crm-table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>시간</th>
                <th>이름</th>
                <th>연락처</th>
                <th>담당자</th>
                <th>지역</th>
                <th>유형</th>
              </tr>
            </thead>
            <tbody>
              {selectedItems.map((it) => (
                <tr key={it.id}>
                  <td>{new Date(it.meeting_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</td>
                  <td>{it.name}</td>
                  <td>{it.phone}</td>
                  <td>{it.assignee_name}</td>
                  <td>{it.region}</td>
                  <td>{it.category === "candidates" ? "후보자" : "소비자"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
