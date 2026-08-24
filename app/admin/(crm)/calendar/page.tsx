"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AssigneePicker from "@/app/admin/_components/crm/AssigneePicker";
import { assigneeColor, formatYmdDot, maskCustomerName, todayYmdLocal } from "@/lib/crm/ui";

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

type Staff = { id: string; name: string; parent_id: string | null };
type ViewMode = "month" | "week" | "agenda";

function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return `${y}년 ${Number(m)}월`;
}

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function ymdFromDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function CalendarPage() {
  const today = todayYmdLocal();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [view, setView] = useState<ViewMode>("month");
  const [assigneeId, setAssigneeId] = useState("");
  const [myOnly, setMyOnly] = useState(false);
  const [items, setItems] = useState<Meeting[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [rank, setRank] = useState<string>("sales");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [detail, setDetail] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekCursor, setWeekCursor] = useState(() => startOfWeek(new Date()));

  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setMeId(d.user.userId);
          setRank(d.user.rank);
        }
      });
  }, []);

  const effectiveAssignee = myOnly && meId ? meId : assigneeId;

  const load = useCallback(() => {
    setLoading(true);
    const sp = new URLSearchParams({ month });
    if (effectiveAssignee) sp.set("assignee_id", effectiveAssignee);
    fetch(`/api/admin/calendar?${sp}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setItems(d.items ?? []);
          setStaff(d.staff ?? []);
        }
      })
      .finally(() => setLoading(false));
  }, [month, effectiveAssignee]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDate = useMemo(() => {
    const map = new Map<string, Meeting[]>();
    for (const it of items) {
      const list = map.get(it.date) ?? [];
      list.push(it);
      map.set(it.date, list);
    }
    for (const [, list] of Array.from(map.entries())) {
      list.sort((a, b) => a.meeting_at.localeCompare(b.meeting_at));
    }
    return map;
  }, [items]);

  const monthCells = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const start = startOfWeek(first);
    const cells: { date: string; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const date = ymdFromDate(d);
      cells.push({ date, inMonth: d.getMonth() === m - 1 });
    }
    return cells;
  }, [month]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekCursor);
      d.setDate(weekCursor.getDate() + i);
      return ymdFromDate(d);
    });
  }, [weekCursor]);

  const goToday = () => {
    const t = todayYmdLocal();
    setMonth(t.slice(0, 7));
    setWeekCursor(startOfWeek(new Date()));
    setSelectedDay(t);
  };

  const patchMeeting = async (m: Meeting, body: Record<string, unknown>) => {
    const cat = m.category === "candidates" ? "candidates" : "consumers";
    const res = await fetch(`/api/admin/leads/${m.id}?category=${cat}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) {
      alert(data.message || "저장 실패");
      return;
    }
    setDetail(null);
    void load();
  };

  const EventBtn = ({ m }: { m: Meeting }) => (
    <button
      type="button"
      className="crm-cal-event"
      style={{ borderLeftColor: assigneeColor(m.assignee_id) }}
      onClick={(e) => {
        e.stopPropagation();
        setDetail(m);
      }}
      title={`${timeLabel(m.meeting_at)} ${m.name}`}
    >
      {timeLabel(m.meeting_at)} {maskCustomerName(m.name)} · {m.assignee_name || "미배정"}
    </button>
  );

  const DayEvents = ({ date, max = 3 }: { date: string; max?: number }) => {
    const list = byDate.get(date) ?? [];
    const shown = list.slice(0, max);
    const more = list.length - shown.length;
    return (
      <>
        {shown.map((m) => (
          <EventBtn key={m.id} m={m} />
        ))}
        {more > 0 && (
          <button
            type="button"
            className="crm-cal-more"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedDay(date);
              setView("agenda");
            }}
          >
            +{more}개 더보기
          </button>
        )}
      </>
    );
  };

  return (
    <div>
      <h1 className="crm-page-title">캘린더</h1>
      <p className="crm-page-desc">대면 상담일을 확인합니다</p>

      <div className="crm-cal-toolbar">
        <div className="crm-cal-nav">
          <button
            type="button"
            className="crm-btn"
            aria-label="이전"
            onClick={() => {
              if (view === "week") {
                const d = new Date(weekCursor);
                d.setDate(d.getDate() - 7);
                setWeekCursor(d);
                setMonth(ymdFromDate(d).slice(0, 7));
              } else {
                setMonth((m) => shiftMonth(m, -1));
              }
            }}
          >
            ‹
          </button>
          <button type="button" className="crm-btn" onClick={goToday}>
            오늘
          </button>
          <button
            type="button"
            className="crm-btn"
            aria-label="다음"
            onClick={() => {
              if (view === "week") {
                const d = new Date(weekCursor);
                d.setDate(d.getDate() + 7);
                setWeekCursor(d);
                setMonth(ymdFromDate(d).slice(0, 7));
              } else {
                setMonth((m) => shiftMonth(m, 1));
              }
            }}
          >
            ›
          </button>
          <div className="crm-cal-title">{view === "week" ? `${formatYmdDot(weekDays[0])} – ${formatYmdDot(weekDays[6])}` : monthLabel(month)}</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {(rank === "admin" || rank === "manager") && (
            <select
              className="crm-select"
              value={assigneeId}
              disabled={myOnly}
              onChange={(e) => setAssigneeId(e.target.value)}
              aria-label="영업자 필터"
            >
              <option value="">전체 영업자</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {meId && (
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
              <input type="checkbox" checked={myOnly} onChange={(e) => setMyOnly(e.target.checked)} />
              내 일정만
            </label>
          )}
          <div className="crm-cal-views" role="tablist" aria-label="보기 전환">
            {(
              [
                ["month", "월"],
                ["week", "주"],
                ["agenda", "일정"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? "is-active" : ""} onClick={() => setView(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="crm-skeleton" style={{ height: 420 }} />
      ) : view === "month" ? (
        <div className="crm-cal-grid">
          {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
            <div key={d} className="crm-cal-dow">
              {d}
            </div>
          ))}
          {monthCells.map((c) => (
            <div
              key={c.date}
              className={`crm-cal-cell${c.inMonth ? "" : " is-outside"}${c.date === today ? " is-today" : ""}`}
              onClick={() => setSelectedDay(c.date)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") setSelectedDay(c.date);
              }}
            >
              <div className="crm-cal-daynum">{Number(c.date.slice(8, 10))}</div>
              <DayEvents date={c.date} />
            </div>
          ))}
        </div>
      ) : view === "week" ? (
        <div className="crm-cal-grid">
          {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
            <div key={d} className="crm-cal-dow">
              {d}
            </div>
          ))}
          {weekDays.map((date) => (
            <div key={date} className={`crm-cal-cell${date === today ? " is-today" : ""}`} style={{ minHeight: 160 }} onClick={() => setSelectedDay(date)}>
              <div className="crm-cal-daynum">{Number(date.slice(8, 10))}</div>
              <div style={{ fontSize: 11, color: "var(--crm-muted)", marginBottom: 4 }}>{formatYmdDot(date)}</div>
              <DayEvents date={date} max={8} />
            </div>
          ))}
        </div>
      ) : (
        <div className="crm-table-shell" style={{ maxHeight: "none" }}>
          <table className="crm-table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>일시</th>
                <th>고객</th>
                <th>담당자</th>
                <th>지역</th>
                <th>유형</th>
              </tr>
            </thead>
            <tbody>
              {(selectedDay ? byDate.get(selectedDay) ?? [] : items)
                .slice()
                .sort((a, b) => a.meeting_at.localeCompare(b.meeting_at))
                .map((m) => (
                  <tr key={m.id} style={{ cursor: "pointer" }} onClick={() => setDetail(m)}>
                    <td>
                      {formatYmdDot(m.date)} {timeLabel(m.meeting_at)}
                    </td>
                    <td>{maskCustomerName(m.name)}</td>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 99, background: assigneeColor(m.assignee_id) }} />
                        {m.assignee_name || "-"}
                      </span>
                    </td>
                    <td>{m.region || "-"}</td>
                    <td>{m.category === "candidates" ? "후보자" : "소비자"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {items.length === 0 && <div className="crm-empty" style={{ border: "none" }}>등록된 대면 일정이 없습니다.</div>}
        </div>
      )}

      {selectedDay && view !== "agenda" && (
        <div style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 15, margin: "0 0 8px" }}>{formatYmdDot(selectedDay)} 일정</h2>
          {(byDate.get(selectedDay) ?? []).length === 0 ? (
            <div style={{ color: "var(--crm-muted)", fontSize: 13 }}>일정 없음</div>
          ) : (
            (byDate.get(selectedDay) ?? []).map((m) => (
              <div key={m.id} style={{ marginBottom: 4 }}>
                <EventBtn m={m} />
              </div>
            ))
          )}
        </div>
      )}

      {detail && (
        <>
          <button type="button" className="crm-drawer-backdrop" aria-label="닫기" onClick={() => setDetail(null)} />
          <aside className="crm-drawer" role="dialog" aria-label="일정 상세">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <strong style={{ fontSize: 16 }}>{detail.name}</strong>
              <button type="button" className="crm-btn" onClick={() => setDetail(null)}>
                닫기
              </button>
            </div>
            <div style={{ display: "grid", gap: 12, fontSize: 13 }}>
              <div>
                <div style={{ color: "var(--crm-muted)", fontSize: 12 }}>연락처</div>
                {detail.phone}
              </div>
              <label>
                <div style={{ color: "var(--crm-muted)", fontSize: 12, marginBottom: 4 }}>대면 일시</div>
                <input
                  className="crm-input"
                  type="datetime-local"
                  value={detail.meeting_at ? detail.meeting_at.slice(0, 16) : ""}
                  onChange={(e) => setDetail({ ...detail, meeting_at: e.target.value ? new Date(e.target.value).toISOString() : detail.meeting_at })}
                  style={{ width: "100%" }}
                />
              </label>
              {(rank === "admin" || rank === "manager") && (
                <div>
                  <div style={{ color: "var(--crm-muted)", fontSize: 12, marginBottom: 4 }}>담당자</div>
                  <AssigneePicker
                    value={detail.assignee_id}
                    staff={staff}
                    onChange={(id) => setDetail({ ...detail, assignee_id: id, assignee_name: staff.find((s) => s.id === id)?.name ?? "" })}
                  />
                </div>
              )}
            </div>
            <div style={{ marginTop: "auto", display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 16 }}>
              <button type="button" className="crm-btn" onClick={() => setDetail(null)}>
                취소
              </button>
              <button
                type="button"
                className="crm-btn crm-btn-primary"
                onClick={() =>
                  void patchMeeting(detail, {
                    meeting_at: detail.meeting_at,
                    ...(rank === "admin" || rank === "manager" ? { assignee_id: detail.assignee_id } : {}),
                  })
                }
              >
                저장
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
