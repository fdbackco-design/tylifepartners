"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type Props = {
  label: string;
  /** 필터 활성 시 헤더에 표시할 짧은 값 */
  activeLabel?: string | null;
  active?: boolean;
  align?: "left" | "right";
  children: (close: () => void) => ReactNode;
};

/** 테이블 헤더 클릭형 필터 (담당자 / 배정일 / 상담상태) */
export default function Tm001ColumnFilter({
  label,
  activeLabel,
  active = false,
  align = "left",
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

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

  const close = () => setOpen(false);
  const display = active && activeLabel ? activeLabel : label;

  return (
    <div ref={root} className={`tm001-col-filter${active ? " is-active" : ""}${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="tm001-col-filter-btn"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        title={`${label} 필터`}
      >
        <span className="tm001-col-filter-label">{display}</span>
        <span className="tm001-col-filter-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div
          id={menuId}
          className={`tm001-col-filter-menu${align === "right" ? " align-right" : ""}`}
          role="dialog"
          aria-label={`${label} 필터`}
        >
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}
