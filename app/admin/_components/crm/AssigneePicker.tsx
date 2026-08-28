"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  unresolvedLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const root = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  return (
    <div ref={root} className={`crm-assignee-picker${busy ? " is-busy" : ""}`}>
      <button
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
      {open && !busy && (
        <div className="crm-popover crm-assignee-popover" role="listbox">
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
                className={`crm-menu-item${!value ? " is-active" : ""}`}
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                {placeholder}
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
        </div>
      )}
    </div>
  );
}
