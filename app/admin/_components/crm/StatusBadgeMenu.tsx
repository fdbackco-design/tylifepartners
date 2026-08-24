"use client";

import { useEffect, useRef, useState } from "react";
import type { LeadStatus } from "@/lib/crm/types";
import { statusClassName } from "@/lib/crm/ui";

type Props = {
  value: LeadStatus;
  options: LeadStatus[];
  onChange: (next: LeadStatus) => void;
  disabled?: boolean;
};

export default function StatusBadgeMenu({ value, options, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={root} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className={statusClassName(value)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        {value}
      </button>
      {open && (
        <div className="crm-popover" role="listbox" style={{ minWidth: 160 }}>
          {(options.includes(value) ? options : [value, ...options]).map((s) => (
            <button
              key={s}
              type="button"
              className={`crm-menu-item${s === value ? " is-active" : ""}`}
              role="option"
              aria-selected={s === value}
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
