"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  label: string;
  /** 필터 활성 시 헤더에 표시할 짧은 값 */
  activeLabel?: string | null;
  active?: boolean;
  align?: "left" | "right";
  children: (close: () => void) => ReactNode;
};

type MenuPos = { top: number; left: number; minWidth: number };

/** 테이블 헤더 클릭형 필터 (담당자 / 지역 / 상담상태 등) */
export default function ColumnFilter({
  label,
  activeLabel,
  active = false,
  align = "left",
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const placeMenu = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuWidth = Math.max(168, Math.min(240, rect.width + 80));
    const pad = 8;
    const maxH = Math.min(320, window.innerHeight * 0.7);
    let left = align === "right" ? rect.right - menuWidth : rect.left;
    left = Math.max(pad, Math.min(left, window.innerWidth - menuWidth - pad));

    const spaceBelow = window.innerHeight - rect.bottom - pad;
    const spaceAbove = rect.top - pad;
    let top = rect.bottom + 6;
    if (spaceBelow < Math.min(maxH, 220) && spaceAbove > spaceBelow) {
      top = Math.max(pad, rect.top - Math.min(maxH, spaceAbove) - 6);
    }
    setPos({ top, left, minWidth: menuWidth });
  };

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    placeMenu();
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (root.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onReposition = () => placeMenu();
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
  }, [open, align]);

  const close = () => setOpen(false);
  const display = active && activeLabel ? activeLabel : label;

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            className="crm-col-filter-menu crm-col-filter-menu-portal"
            role="dialog"
            aria-label={`${label} 필터`}
            style={
              pos
                ? { top: pos.top, left: pos.left, minWidth: pos.minWidth }
                : { top: -9999, left: -9999, minWidth: 168 }
            }
          >
            {children(close)}
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={root} className={`crm-col-filter${active ? " is-active" : ""}${open ? " is-open" : ""}`}>
      <button
        ref={btnRef}
        type="button"
        className="crm-col-filter-btn"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        title={`${label} 필터`}
      >
        <span className="crm-col-filter-label">{display}</span>
        <span className="crm-col-filter-caret" aria-hidden>
          ▾
        </span>
      </button>
      {menu}
    </div>
  );
}
