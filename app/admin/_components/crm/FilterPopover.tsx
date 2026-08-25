"use client";

import { useEffect, useRef, useState } from "react";

export type FilterGroup = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
};

type Props = {
  groups: FilterGroup[];
  onApply: (next: Record<string, string[]>) => void;
  onReset: () => void;
};

export default function FilterPopover({ groups, onApply, onReset }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const root = useRef<HTMLDivElement>(null);
  const count = groups.reduce((n, g) => n + g.selected.length, 0);

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

  const toggle = (key: string, value: string) => {
    setDraft((prev) => {
      const cur = prev[key] ?? [];
      return {
        ...prev,
        [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value],
      };
    });
  };

  return (
    <div ref={root} style={{ position: "relative" }}>
      <button
        type="button"
        className="crm-btn"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (!open) {
            const init: Record<string, string[]> = {};
            for (const g of groups) init[g.key] = [...g.selected];
            setDraft(init);
          }
          setOpen((v) => !v);
        }}
      >
        필터
        {count > 0 && <span className="crm-badge">{count}</span>}
      </button>
      {open && (
        <div className="crm-popover crm-popover-right crm-filter-popover" role="dialog" aria-label="필터">
          {groups.map((g) => (
            <div key={g.key} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--crm-muted)", marginBottom: 6 }}>{g.label}</div>
              <div style={{ display: "grid", gap: 4, maxHeight: 120, overflow: "auto" }}>
                {g.options.length === 0 && <div style={{ fontSize: 12, color: "var(--crm-muted-2)" }}>옵션 없음</div>}
                {g.options.map((o) => (
                  <label key={o.value} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={(draft[g.key] ?? []).includes(o.value)}
                      onChange={() => toggle(g.key, o.value)}
                    />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, position: "sticky", bottom: 0, background: "#fff", paddingTop: 8 }}>
            <button
              type="button"
              className="crm-btn"
              onClick={() => {
                onReset();
                setOpen(false);
              }}
            >
              초기화
            </button>
            <button
              type="button"
              className="crm-btn crm-btn-primary"
              onClick={() => {
                onApply(draft);
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
