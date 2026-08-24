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
};

export default function AssigneePicker({ value, staff, teamName, history, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const current = staff.find((s) => s.id === value);
  const label = formatAssigneeWithTeam(current?.name || "", teamName);
  const historyText =
    history && history.length >= 2 ? history.join(" -> ") : "";

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

  return (
    <div ref={root} style={{ position: "relative", minWidth: 120 }}>
      <button
        type="button"
        className="crm-btn"
        style={{ width: "100%", justifyContent: "flex-start", height: "auto", minHeight: 36, padding: "6px 10px" }}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span style={{ textAlign: "left", lineHeight: 1.3 }}>{value ? label : "미배정"}</span>
      </button>
      {historyText ? (
        <div
          style={{
            marginTop: 4,
            fontSize: 11,
            lineHeight: 1.35,
            color: "var(--crm-muted)",
            wordBreak: "keep-all",
          }}
          title={historyText}
        >
          {historyText}
        </div>
      ) : null}
      {open && (
        <div className="crm-popover" role="listbox" style={{ minWidth: 220 }}>
          <input
            className="crm-input"
            placeholder="담당자 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: "100%", marginBottom: 8 }}
            autoFocus
          />
          <button
            type="button"
            className={`crm-menu-item${!value ? " is-active" : ""}`}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            미배정
          </button>
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
        </div>
      )}
    </div>
  );
}
