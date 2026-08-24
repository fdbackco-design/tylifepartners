"use client";

import { useEffect, useRef, useState } from "react";
import { addDaysLocal, endOfMonthYmd, formatYmdDot, startOfMonthYmd, todayYmdLocal } from "@/lib/crm/ui";

type Props = {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
};

const PRESETS = [
  { label: "오늘", get: () => { const t = todayYmdLocal(); return [t, t] as const; } },
  { label: "최근 7일", get: () => { const t = todayYmdLocal(); return [addDaysLocal(t, -6), t] as const; } },
  { label: "최근 30일", get: () => { const t = todayYmdLocal(); return [addDaysLocal(t, -29), t] as const; } },
  { label: "이번 달", get: () => { const t = todayYmdLocal(); return [startOfMonthYmd(t), endOfMonthYmd(t)] as const; } },
];

export default function DateRangePicker({ from, to, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setDraftFrom(from);
      setDraftTo(to);
    }
  }, [open, from, to]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label =
    from || to
      ? `${from ? formatYmdDot(from) : "시작"} – ${to ? formatYmdDot(to) : "종료"}`
      : "기간 선택";

  return (
    <div ref={root} style={{ position: "relative" }}>
      <button type="button" className="crm-btn" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)}>
        {label}
      </button>
      {open && (
        <div className="crm-popover crm-popover-right" role="dialog" aria-label="기간 선택">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className="crm-btn"
                style={{ height: 28, fontSize: 12 }}
                onClick={() => {
                  const [a, b] = p.get();
                  setDraftFrom(a);
                  setDraftTo(b);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ fontSize: 12, color: "var(--crm-muted)" }}>
              시작일
              <input className="crm-input" type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} style={{ width: "100%", marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12, color: "var(--crm-muted)" }}>
              종료일
              <input className="crm-input" type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} style={{ width: "100%", marginTop: 4 }} />
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className="crm-btn"
              onClick={() => {
                onChange("", "");
                setOpen(false);
              }}
            >
              초기화
            </button>
            <button
              type="button"
              className="crm-btn crm-btn-primary"
              onClick={() => {
                onChange(draftFrom, draftTo);
                setOpen(false);
              }}
            >
              적용
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
