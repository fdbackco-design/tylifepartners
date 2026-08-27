"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  CALENDAR_EVENT_TYPES,
  CALENDAR_EVENT_TYPE_COLORS,
  CALENDAR_EVENT_TYPE_LABELS,
  CALENDAR_VISIBILITY_LABELS,
  eventTitle,
  type CalendarEventRow,
  type CalendarEventType,
  type CalendarVisibility,
} from "@/lib/crm/calendar";
import { todayYmdLocal } from "@/lib/crm/ui";
import "./calendar.css";

type ViewerOpt = { id: string; name: string; rank: string; parent_id: string | null; is_active: boolean };

type DayModal =
  | { mode: "day"; date: string }
  | { mode: "edit"; date: string; event: CalendarEventRow | null }
  | null;

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const CELL_MAX = 2;

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

function formatDayTitle(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`;
}

export default function CalendarPage() {
  const today = todayYmdLocal();
  const sheetRef = useRef<HTMLElement>(null);
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [items, setItems] = useState<CalendarEventRow[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [rank, setRank] = useState<string>("sales");
  const [viewerOptions, setViewerOptions] = useState<{ managers: ViewerOpt[]; sales: ViewerOpt[] }>({
    managers: [],
    sales: [],
  });
  const [typeFilter, setTypeFilter] = useState<Set<CalendarEventType>>(() => new Set(CALENDAR_EVENT_TYPES));
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("준비됨");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<DayModal>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  // form state
  const [formType, setFormType] = useState<CalendarEventType>("general");
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formVis, setFormVis] = useState<CalendarVisibility>("all");
  const [formViewers, setFormViewers] = useState<string[]>([]);
  const [viewerSearch, setViewerSearch] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2200);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setStatus("불러오는 중…");
    try {
      const types = Array.from(typeFilter).join(",");
      const res = await fetch(
        `/api/admin/calendar?month=${encodeURIComponent(month)}&types=${encodeURIComponent(types)}`
      );
      const d = await res.json();
      if (!d.ok) {
        setStatus(d.message || "불러오기 실패");
        return;
      }
      setItems(d.items ?? []);
      setCanEdit(Boolean(d.can_edit));
      setRank(d.me?.rank || "sales");
      setViewerOptions(d.viewer_options ?? { managers: [], sales: [] });
      setStatus(`일정 ${d.items?.length ?? 0}건`);
    } catch {
      setStatus("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [month, typeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEventRow[]>();
    for (const it of items) {
      const list = map.get(it.event_date) ?? [];
      list.push(it);
      map.set(it.event_date, list);
    }
    return map;
  }, [items]);

  const monthCells = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const start = startOfWeek(first);
    const cells: { date: string; inMonth: boolean; dow: number }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const date = ymdFromDate(d);
      const inMonth = d.getMonth() === m - 1;
      if (i >= 35 && !inMonth) break;
      cells.push({ date, inMonth, dow: d.getDay() });
    }
    return cells;
  }, [month]);

  const monthLabel = month.slice(5, 7);
  const yearLabel = month.slice(0, 4);

  const toggleType = (t: CalendarEventType) => {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) {
        if (next.size === 1) return prev;
        next.delete(t);
      } else next.add(t);
      return next;
    });
  };

  const openDay = (date: string, inMonth: boolean) => {
    if (!inMonth) return;
    setModal({ mode: "day", date });
  };

  const openCreate = (date: string) => {
    if (!canEdit) return;
    setFormType("general");
    setFormTitle("");
    setFormBody("");
    setFormVis("all");
    setFormViewers([]);
    setViewerSearch("");
    setModal({ mode: "edit", date, event: null });
  };

  const openEdit = (ev: CalendarEventRow) => {
    if (ev.read_only || ev.source === "lead_meeting") {
      setModal({ mode: "day", date: ev.event_date });
      showToast("고객 대면일은 고객 DB에서 수정해 주세요.");
      return;
    }
    if (!canEdit) {
      setModal({ mode: "day", date: ev.event_date });
      return;
    }
    setFormType(ev.event_type);
    setFormTitle(ev.title);
    setFormBody(ev.body);
    setFormVis(ev.visibility);
    setFormViewers(ev.viewer_ids ?? []);
    setViewerSearch("");
    setModal({ mode: "edit", date: ev.event_date, event: ev });
  };

  const saveEvent = async () => {
    if (!modal || modal.mode !== "edit") return;
    setSaving(true);
    try {
      const payload = {
        event_date: modal.date,
        event_type: formType,
        title: formTitle.trim(),
        body: formBody,
        visibility: formVis,
        viewer_ids: formViewers,
      };
      const isNew = !modal.event;
      const res = await fetch(isNew ? "/api/admin/calendar" : `/api/admin/calendar/${modal.event!.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!d.ok) {
        showToast(d.message || "저장 실패");
        return;
      }
      showToast(isNew ? "일정을 등록했습니다." : "일정을 수정했습니다.");
      setModal({ mode: "day", date: modal.date });
      void load();
    } catch {
      showToast("네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async () => {
    if (!modal || modal.mode !== "edit" || !modal.event) return;
    if (!window.confirm("이 일정을 삭제할까요?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/calendar/${modal.event.id}`, { method: "DELETE" });
      const d = await res.json();
      if (!d.ok) {
        showToast(d.message || "삭제 실패");
        return;
      }
      showToast("삭제했습니다.");
      setModal({ mode: "day", date: modal.date });
      void load();
    } catch {
      showToast("네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  const downloadPng = async () => {
    if (!sheetRef.current) return;
    if (typeFilter.size === 0) {
      showToast("이미지로 저장할 일정 종류를 한 개 이상 선택해 주세요.");
      return;
    }
    setStatus("PNG 생성 중…");
    // 모바일 CSS는 셀 제목을 숨기고 점으로 바꾸므로, export 전에 PC 레이아웃으로 전환
    flushSync(() => setExporting(true));
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    const source = sheetRef.current;
    const mount = document.createElement("div");
    mount.setAttribute("aria-hidden", "true");
    // iOS Safari: opacity:0 / 과도한 화면 밖 배치는 텍스트가 비거나 점으로만 캡처되는 경우가 있음
    mount.style.cssText =
      "position:fixed;left:0;top:0;width:1120px;padding:0;margin:0;background:#F3F0F9;pointer-events:none;z-index:-1;overflow:visible;transform:translateX(-100%);";
    document.body.appendChild(mount);

    const forceDesktopCellStyles = (root: HTMLElement) => {
      root.querySelectorAll<HTMLElement>(".wc-day__mark, .wc-day__more, .wc-agenda, .wc-nav, .wc-period__pick").forEach((el) => {
        el.style.setProperty("display", "none", "important");
      });
      root.querySelectorAll<HTMLElement>(".wc-day__items").forEach((el) => {
        el.style.setProperty("display", "flex", "important");
        el.style.flexDirection = "column";
        el.style.gap = "3px";
        el.style.flex = "1";
        el.style.width = "100%";
        el.style.overflow = "hidden";
        el.style.minHeight = "0";
      });
      root.querySelectorAll<HTMLElement>(".wc-day").forEach((el) => {
        el.style.setProperty("min-height", "118px", "important");
        el.style.setProperty("height", "auto", "important");
        el.style.setProperty("aspect-ratio", "auto", "important");
        el.style.setProperty("padding", "8px 8px 10px", "important");
        el.style.setProperty("align-items", "stretch", "important");
        el.style.setProperty("justify-content", "flex-start", "important");
        el.style.setProperty("gap", "4px", "important");
      });
      root.querySelectorAll<HTMLElement>(".wc-day__head").forEach((el) => {
        el.style.setProperty("justify-content", "flex-start", "important");
        el.style.setProperty("width", "auto", "important");
      });
      root.querySelectorAll<HTMLElement>(".wc-ev").forEach((el) => {
        el.style.setProperty("display", "block", "important");
        el.style.setProperty("font-size", "11px", "important");
        el.style.setProperty("line-height", "1.35", "important");
        el.style.setProperty("white-space", "nowrap", "important");
        el.style.setProperty("overflow", "hidden", "important");
        el.style.setProperty("text-overflow", "ellipsis", "important");
        el.style.setProperty("visibility", "visible", "important");
        el.style.setProperty("opacity", "1", "important");
        el.style.setProperty("color", "#33254d", "important");
      });
      root.querySelectorAll<HTMLElement>(".wc-ev b").forEach((el) => {
        el.style.setProperty("display", "inline", "important");
        el.style.setProperty("font-size", "11px", "important");
        el.style.setProperty("font-weight", "800", "important");
        el.style.setProperty("visibility", "visible", "important");
        el.style.setProperty("opacity", "1", "important");
      });
    };

    try {
      const clone = source.cloneNode(true) as HTMLElement;
      clone.classList.add("wc-exporting");
      if (!clone.classList.contains("wc-sheet")) clone.classList.add("wc-sheet");
      const exportRoot = document.createElement("div");
      exportRoot.className = "wc wc-exporting";
      exportRoot.style.width = "1120px";
      exportRoot.appendChild(clone);
      mount.appendChild(exportRoot);
      forceDesktopCellStyles(exportRoot);

      const imgs = Array.from(exportRoot.querySelectorAll("img"));
      await Promise.all(
        imgs.map(
          (img) =>
            img.complete
              ? Promise.resolve()
              : new Promise<void>((resolve) => {
                  img.onload = () => resolve();
                  img.onerror = () => resolve();
                })
        )
      );
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const { toPng } = await import("html-to-image");
      const width = Math.max(exportRoot.scrollWidth, exportRoot.offsetWidth, clone.scrollWidth, 1120);
      const height = Math.max(exportRoot.scrollHeight, exportRoot.offsetHeight, clone.scrollHeight);
      const dataUrl = await toPng(exportRoot, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#F3F0F9",
        width,
        height,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: "none",
          margin: "0",
        },
      });

      const filterSlug =
        typeFilter.size === CALENDAR_EVENT_TYPES.length
          ? "전체"
          : Array.from(typeFilter)
              .map((t) => CALENDAR_EVENT_TYPE_LABELS[t])
              .join("+");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `FEEDLIFE_업무캘린더_${month.replace("-", "")}_${filterSlug}.png`;
      a.click();
      setStatus("PNG 저장 완료");
      showToast(
        typeFilter.size === CALENDAR_EVENT_TYPES.length
          ? "월간 캘린더 PNG를 저장했습니다."
          : `선택한 종류(${filterSlug})만 PNG로 저장했습니다.`
      );
    } catch (e) {
      console.error(e);
      setStatus("PNG 저장 실패");
      showToast("PNG 저장에 실패했습니다.");
    } finally {
      mount.remove();
      setExporting(false);
    }
  };

  const visibilityChoices: CalendarVisibility[] =
    rank === "manager" ? ["all", "sales"] : ["all", "admin_plus", "managers", "sales"];

  const pickerList = useMemo(() => {
    const base =
      formVis === "managers" ? viewerOptions.managers : formVis === "sales" ? viewerOptions.sales : [];
    const q = viewerSearch.trim().toLowerCase();
    if (!q) return base;
    return base.filter((u) => u.name.toLowerCase().includes(q));
  }, [formVis, viewerOptions.managers, viewerOptions.sales, viewerSearch]);

  const dayEvents = modal ? byDate.get(modal.date) ?? [] : [];

  return (
    <div className="wc">
      <div className="wc-bar">
        <div className="wc-bar__brand">FEED LIFE · Work Calendar</div>
        <div className="wc-bar__status">{loading ? "로딩 중…" : status}</div>
        <button
          type="button"
          className="wc-btn wc-btn--point"
          disabled={exporting || loading}
          onClick={() => void downloadPng()}
        >
          {exporting ? "저장 중…" : "PNG 저장"}
        </button>
        <p className="wc-bar__hint">상단 종류 필터를 선택한 뒤 PNG 저장하면, 선택된 일정만 이미지에 포함됩니다.</p>
      </div>

      <section className={`wc-sheet${exporting ? " wc-exporting" : ""}`} ref={sheetRef}>
        <header className="wc-masthead">
          <div className="wc-masthead__bg" aria-hidden />
          <div className="wc-masthead__row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="wc-logo" src="/assets/calendar/logo_w.png" alt="FEED LIFE" />
            <div className="wc-masthead__eyebrow">
              WORK CALENDAR
              <b>업무 캘린더</b>
            </div>
          </div>

          <div className="wc-period">
            <div className="wc-period__ym">
              <span className="wc-period__month">{monthLabel}</span>
              <span className="wc-period__year">{yearLabel}</span>
            </div>
            <span className="wc-period__label">MONTHLY PLAN</span>
            <div className="wc-nav">
              <button type="button" aria-label="이전 달" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
                ‹
              </button>
              <button type="button" aria-label="다음 달" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
                ›
              </button>
            </div>
            <input
              className="wc-period__pick"
              type="month"
              value={month}
              aria-label="연월 선택"
              onChange={(e) => e.target.value && setMonth(e.target.value)}
            />
          </div>

          <div className="wc-filters" aria-label="일정 종류 필터">
            {CALENDAR_EVENT_TYPES.map((t) => {
              const on = typeFilter.has(t);
              const c = CALENDAR_EVENT_TYPE_COLORS[t];
              return (
                <button
                  key={t}
                  type="button"
                  className={`wc-chip${on ? " is-on" : ""}`}
                  aria-pressed={on}
                  onClick={() => toggleType(t)}
                >
                  <i style={{ background: c.accent }} />
                  {CALENDAR_EVENT_TYPE_LABELS[t]}
                </button>
              );
            })}
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="wc-mascot" src="/assets/calendar/db.webp" alt="" />
        </header>

        <div className="wc-cal">
          <div className="wc-cal__dow">
            {WD.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="wc-cal__grid">
            {monthCells.map((c) => {
              const list = c.inMonth ? byDate.get(c.date) ?? [] : [];
              const cellMax = exporting ? 5 : CELL_MAX;
              const shown = list.slice(0, cellMax);
              const more = list.length - shown.length;
              const primary = list[0];
              const accent = primary ? CALENDAR_EVENT_TYPE_COLORS[primary.event_type].accent : undefined;
              return (
                <button
                  key={c.date}
                  type="button"
                  className={[
                    "wc-day",
                    c.inMonth ? "" : "wc-day--out",
                    c.dow === 0 ? "wc-day--sun" : "",
                    c.dow === 6 ? "wc-day--sat" : "",
                    c.date === today ? "wc-day--today" : "",
                    list.length ? "has-item" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={accent && c.inMonth ? { borderLeftColor: accent } : undefined}
                  disabled={!c.inMonth}
                  onClick={() => openDay(c.date, c.inMonth)}
                >
                  <div className="wc-day__head">
                    <span className="wc-day__n">{Number(c.date.slice(8, 10))}</span>
                    {c.date === today && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="wc-day__db" src="/assets/calendar/db_s.webp" alt="" />
                    )}
                  </div>
                  <div className="wc-day__items">
                    {shown.map((ev) => {
                      const col = CALENDAR_EVENT_TYPE_COLORS[ev.event_type];
                      return (
                        <span
                          key={ev.id}
                          className="wc-ev"
                          style={{ borderLeftColor: col.accent, background: col.bg, color: col.text }}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(ev);
                          }}
                          role="presentation"
                        >
                          <b>{eventTitle(ev)}</b>
                        </span>
                      );
                    })}
                  </div>
                  {more > 0 && (
                    <span className="wc-day__more" role="presentation">
                      +{more}개
                    </span>
                  )}
                  <span className="wc-day__mark" />
                </button>
              );
            })}
          </div>

          <div className="wc-legend">
            {CALENDAR_EVENT_TYPES.map((t) => (
              <b key={t} className={typeFilter.has(t) ? "is-on" : undefined}>
                <i style={{ background: CALENDAR_EVENT_TYPE_COLORS[t].accent }} />
                {CALENDAR_EVENT_TYPE_LABELS[t]}
              </b>
            ))}
            <em>날짜를 누르면 일정 목록 · 상세가 열립니다</em>
          </div>

          <div className="wc-agenda">
            <div className="wc-agenda__tit">이달의 일정</div>
            {items.length === 0 ? (
              <div className="wc-agenda__empty">등록된 일정이 없습니다.</div>
            ) : (
              items.map((ev) => {
                const d = new Date(`${ev.event_date}T00:00:00`);
                const col = CALENDAR_EVENT_TYPE_COLORS[ev.event_type];
                return (
                  <button
                    key={ev.id}
                    type="button"
                    className="wc-ag"
                    style={{ borderLeftColor: col.accent }}
                    onClick={() => openEdit(ev)}
                  >
                    <span className="wc-ag__d">
                      <b>{String(d.getDate()).padStart(2, "0")}</b>
                      <i>{WD[d.getDay()]}</i>
                    </span>
                    <span className="wc-ag__body">
                      <b style={{ color: col.text }}>{eventTitle(ev)}</b>
                      {ev.body && ev.body !== ev.title ? ev.body.split("\n").slice(0, 2).join(" ") : ""}
                    </span>
                    <span className="wc-ag__tag">{CALENDAR_EVENT_TYPE_LABELS[ev.event_type]}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <footer className="wc-signoff">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/calendar/logo_w.png" alt="FEED LIFE" />
          <span>WORK CALENDAR</span>
        </footer>
      </section>

      {modal && (
        <div
          className="wc-ov"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div className="wc-ed">
            <div className="wc-ed__grip" />
            <div className="wc-ed__head">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="wc-ed__db" src="/assets/calendar/db_s.webp" alt="" />
              <span className="wc-ed__title">
                {modal.mode === "day" ? formatDayTitle(modal.date) : modal.event ? "일정 수정" : "일정 등록"}
              </span>
              <button type="button" className="wc-ed__close" onClick={() => setModal(null)}>
                닫기
              </button>
            </div>

            {modal.mode === "day" ? (
              <div className="wc-ed__inner">
                <div className="wc-ed__list">
                  {dayEvents.length === 0 && (
                    <div className="wc-agenda__empty">이 날의 일정이 없습니다.</div>
                  )}
                  {dayEvents.map((ev) => {
                    const col = CALENDAR_EVENT_TYPE_COLORS[ev.event_type];
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        className="wc-ed__row"
                        style={{ borderLeftColor: col.accent }}
                        onClick={() => openEdit(ev)}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <strong style={{ color: col.text }}>{eventTitle(ev)}</strong>
                          <span>
                            {CALENDAR_EVENT_TYPE_LABELS[ev.event_type]}
                            {ev.source === "lead_meeting" ? " · 고객 DB" : ""}
                            {ev.body ? `\n${ev.body}` : ""}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="wc-ed__foot">
                  <button type="button" className="wc-ed__wipe" onClick={() => setModal(null)}>
                    닫기
                  </button>
                  {canEdit && (
                    <button type="button" className="wc-ed__done" onClick={() => openCreate(modal.date)}>
                      일정 추가
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="wc-ed__inner">
                <div className="wc-ed__lab">날짜</div>
                <input
                  className="wc-ed__field"
                  type="date"
                  value={modal.date}
                  onChange={(e) => {
                    if (e.target.value) setModal({ ...modal, date: e.target.value });
                  }}
                />

                <div className="wc-ed__lab">일정 종류</div>
                <div className="wc-ed__types">
                  {CALENDAR_EVENT_TYPES.map((t) => {
                    const col = CALENDAR_EVENT_TYPE_COLORS[t];
                    const on = formType === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={on}
                        style={on ? { background: col.accent, color: t === "deadline" || t === "general" ? (t === "deadline" ? "#101010" : "#fff") : "#fff" } : undefined}
                        onClick={() => setFormType(t)}
                      >
                        {CALENDAR_EVENT_TYPE_LABELS[t]}
                      </button>
                    );
                  })}
                </div>

                <div className="wc-ed__lab">제목</div>
                <input
                  className="wc-ed__field"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="일정 제목"
                />

                <div className="wc-ed__lab">내용</div>
                <textarea
                  className="wc-ed__text"
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  placeholder="일정을 입력하세요"
                />

                <div className="wc-ed__lab">열람 권한</div>
                <div className="wc-ed__vis">
                  {visibilityChoices.map((v) => (
                    <label key={v}>
                      <input
                        type="radio"
                        name="vis"
                        checked={formVis === v}
                        onChange={() => {
                          setFormVis(v);
                          setFormViewers([]);
                          setViewerSearch("");
                        }}
                      />
                      {rank === "manager" && v === "all"
                        ? "팀 전체 열람 (본인·팀 영업자)"
                        : CALENDAR_VISIBILITY_LABELS[v]}
                    </label>
                  ))}
                </div>
                {rank === "manager" && (
                  <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--wc-muted)" }}>
                    매니저 일정은 관리자에게 공개되지 않습니다.
                  </p>
                )}

                {(formVis === "managers" || formVis === "sales") && (
                  <>
                    <div className="wc-ed__lab">
                      열람 대상 (복수 선택)
                      {formViewers.length > 0 ? ` · ${formViewers.length}명 선택` : ""}
                    </div>
                    <input
                      className="wc-ed__field wc-ed__search"
                      type="search"
                      value={viewerSearch}
                      onChange={(e) => setViewerSearch(e.target.value)}
                      placeholder={formVis === "managers" ? "매니저 이름 검색" : "영업자 이름 검색"}
                      aria-label={formVis === "managers" ? "매니저 이름 검색" : "영업자 이름 검색"}
                    />
                    <div className="wc-ed__pick">
                      {pickerList.length === 0 && (
                        <span style={{ fontSize: 12, color: "var(--wc-muted)" }}>
                          {viewerSearch.trim()
                            ? "검색 결과가 없습니다."
                            : "선택 가능한 사용자가 없습니다."}
                        </span>
                      )}
                      {pickerList.map((u) => (
                        <label key={u.id}>
                          <input
                            type="checkbox"
                            checked={formViewers.includes(u.id)}
                            onChange={(e) => {
                              setFormViewers((prev) =>
                                e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id)
                              );
                            }}
                          />
                          {u.name}
                        </label>
                      ))}
                    </div>
                  </>
                )}

                <div className="wc-ed__foot">
                  {modal.event ? (
                    <button type="button" className="wc-ed__wipe" disabled={saving} onClick={() => void deleteEvent()}>
                      삭제
                    </button>
                  ) : (
                    <button type="button" className="wc-ed__wipe" onClick={() => setModal({ mode: "day", date: modal.date })}>
                      취소
                    </button>
                  )}
                  <button type="button" className="wc-ed__done" disabled={saving} onClick={() => void saveEvent()}>
                    {saving ? "저장 중…" : "저장"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={`wc-toast${toast ? " is-on" : ""}`}>{toast}</div>
    </div>
  );
}
