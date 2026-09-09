"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatAssigneeWithTeam } from "@/lib/crm/assigneeHistoryFormat";

type Staff = { id: string; name: string; parent_id: string | null };

type Props = {
  value: string | null;
  staff: Staff[];
  teamName?: string;
  history?: string[];
  onChange: (id: string | null) => void;
  disabled?: boolean;
  busy?: boolean;
  /** 미선택 시 버튼 라벨 (기본: 미배정) */
  placeholder?: string;
  /** 미배정/선택 해제 항목 표시 (기본: true) */
  allowClear?: boolean;
  /** 미배정/선택 해제 항목 라벨 (기본: placeholder) */
  clearLabel?: string;
  /**
   * clear 항목 활성 표시. 미지정 시 value == null 이면 활성.
   * 일괄 변경처럼 “아직 선택 안 함”과 “미배정 선택”을 구분할 때 false로 둠.
   */
  clearIsSelected?: boolean;
  /** value가 staff 목록에 없을 때 표시 (비활성·삭제된 담당자) */
  unresolvedLabel?: string | null;
};

export default function AssigneePicker({
  value,
  staff,
  teamName,
  history,
  onChange,
  disabled,
  busy,
  placeholder = "미배정",
  allowClear = true,
  clearLabel,
  clearIsSelected,
  unresolvedLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const current = staff.find((s) => s.id === value);
  const fallbackName = String(unresolvedLabel ?? "").trim();
  const missingFromList = Boolean(value && !current);

  let label = placeholder;
  if (value) {
    if (current?.name) {
      label = formatAssigneeWithTeam(current.name, teamName);
    } else if (fallbackName) {
      label = `${fallbackName} (비활성)`;
    } else {
      label = "담당자 없음(비활성/삭제)";
    }
  }

  const historyText =
    history && history.length >= 2 ? history.join(" -> ") : "";
  const locked = Boolean(disabled || busy);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return staff;
    return staff.filter((s) => s.name.toLowerCase().includes(term));
  }, [staff, q]);

  const placePanel = () => {
    const btn = triggerRef.current;
    const panel = panelRef.current;
    if (!btn || !panel) return;
    const r = btn.getBoundingClientRect();
    const pw = Math.max(panel.offsetWidth || 220, r.width, 220);
    const ph = panel.offsetHeight || 200;
    const gap = 6;
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < ph + gap && r.top > ph + gap;
    let left = r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    const top = openUp ? Math.max(8, r.top - ph - gap) : r.bottom + gap;
    setPos({ top, left, width: pw });
  };

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    placePanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- place when open/filter size changes
  }, [open, filtered.length, q, allowClear, missingFromList]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (root.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onReposition = () => placePanel();
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const panel =
    open && !busy && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            className="crm-popover crm-assignee-popover crm-assignee-popover-portal"
            role="listbox"
            style={
              pos
                ? { top: pos.top, left: pos.left, minWidth: pos.width }
                : { top: -9999, left: -9999, minWidth: 220 }
            }
          >
            <input
              className="crm-input"
              placeholder="담당자 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: "100%", marginBottom: 8, flexShrink: 0 }}
              autoFocus
            />
            <div className="crm-assignee-popover-list">
              {allowClear ? (
                <button
                  type="button"
                  className={`crm-menu-item${(clearIsSelected ?? value == null) ? " is-active" : ""}`}
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  {clearLabel ?? placeholder}
                </button>
              ) : null}
              {missingFromList ? (
                <button type="button" className="crm-menu-item is-active" disabled>
                  {fallbackName ? `${fallbackName} (비활성)` : "담당자 없음(비활성/삭제)"}
                </button>
              ) : null}
              {filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`crm-menu-item${s.id === value ? " is-active" : ""}`}
                  onClick={() => {
                    onChange(s.id);
                    setOpen(false);
                  }}
                >
                  {s.name}
                </button>
              ))}
              {filtered.length === 0 && !missingFromList ? (
                <div className="crm-ui-hint" style={{ padding: "8px 10px" }}>
                  검색 결과가 없습니다
                </div>
              ) : null}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={root} className={`crm-assignee-picker${busy ? " is-busy" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className="crm-btn crm-assignee-picker-btn"
        disabled={locked}
        onClick={() => !locked && setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-busy={busy || undefined}
      >
        {busy ? <span className="crm-assignee-picker-spinner" aria-hidden /> : null}
        <span className="crm-assignee-picker-label">{label}</span>
        {busy ? <span className="crm-assignee-picker-busy-text">저장 중</span> : null}
      </button>
      {historyText ? (
        <div className="crm-assignee-picker-history" title={historyText}>
          {historyText}
        </div>
      ) : null}
      {panel}
    </div>
  );
}
