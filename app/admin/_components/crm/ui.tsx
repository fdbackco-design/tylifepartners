"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";

export function CrmButton({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      {...props}
      className={`crm-ui-btn crm-ui-btn-${variant} crm-ui-btn-${size} ${className}`.trim()}
    />
  );
}

export function CrmInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`crm-ui-input ${className}`.trim()} />;
}

export function CrmSelect({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`crm-ui-select ${className}`.trim()}>
      {children}
    </select>
  );
}

export function CrmField({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="crm-ui-field">
      <label className="crm-ui-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error ? <p className="crm-ui-hint">{hint}</p> : null}
      {error ? <p className="crm-ui-error">{error}</p> : null}
    </div>
  );
}

export function CrmBadge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "primary";
  children: ReactNode;
}) {
  return <span className={`crm-ui-badge crm-ui-badge-${tone}`}>{children}</span>;
}

export function CrmSwitch({
  checked,
  onChange,
  disabled,
  label,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
}) {
  const autoId = useId();
  const switchId = id ?? autoId;
  return (
    <label className={`crm-ui-switch ${disabled ? "is-disabled" : ""}`} htmlFor={switchId}>
      <input
        id={switchId}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-checked={checked}
      />
      <span className="crm-ui-switch-track" aria-hidden />
      {label ? <span className="crm-ui-switch-label">{label}</span> : null}
    </label>
  );
}

export function CrmCheckbox({
  checked,
  onChange,
  disabled,
  label,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: ReactNode;
  id?: string;
}) {
  const autoId = useId();
  const checkId = id ?? autoId;
  return (
    <label className={`crm-ui-check ${disabled ? "is-disabled" : ""}`} htmlFor={checkId}>
      <input
        id={checkId}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="crm-ui-check-box" aria-hidden />
      {label ? <span className="crm-ui-check-label">{label}</span> : null}
    </label>
  );
}

export function CrmEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="crm-ui-empty">
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action ? <div className="crm-ui-empty-action">{action}</div> : null}
    </div>
  );
}

export function CrmAlert({
  tone = "info",
  children,
}: {
  tone?: "info" | "success" | "danger";
  children: ReactNode;
}) {
  return <div className={`crm-ui-alert crm-ui-alert-${tone}`} role="status">{children}</div>;
}

export function CrmPageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="crm-ui-page-header">
      <div className="crm-ui-page-header-main">
        <div>
          <h1 className="crm-page-title">{title}</h1>
          {description ? <p className="crm-page-desc">{description}</p> : null}
        </div>
        {actions ? <div className="crm-ui-page-header-actions">{actions}</div> : null}
      </div>
      {meta ? <div className="crm-ui-page-meta">{meta}</div> : null}
    </div>
  );
}

export function CrmStatRow({ items }: { items: { label: string; value: string | number }[] }) {
  return (
    <div className="crm-ui-stats">
      {items.map((it) => (
        <div key={it.label} className="crm-ui-stat">
          <div className="crm-ui-stat-value">{it.value}</div>
          <div className="crm-ui-stat-label">{it.label}</div>
        </div>
      ))}
    </div>
  );
}

export function CrmTable({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`crm-ui-table-shell ${className}`.trim()}>
      <table className="crm-ui-table">{children}</table>
    </div>
  );
}

export function CrmChip({
  children,
  onRemove,
  disabled,
}: {
  children: ReactNode;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  return (
    <span className="crm-ui-chip">
      {children}
      {onRemove ? (
        <button type="button" className="crm-ui-chip-x" onClick={onRemove} disabled={disabled} aria-label="제거">
          ×
        </button>
      ) : null}
    </span>
  );
}

export function CrmDialog({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="crm-ui-overlay crm-ui-overlay-center" role="presentation">
      <button type="button" className="crm-ui-overlay-backdrop" aria-label="닫기" onClick={onClose} />
      <div className="crm-ui-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="crm-ui-dialog-head">
          <h2>{title}</h2>
          <CrmButton variant="ghost" size="sm" onClick={onClose} aria-label="닫기">
            닫기
          </CrmButton>
        </div>
        <div className="crm-ui-dialog-body">{children}</div>
        {footer ? <div className="crm-ui-dialog-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

export function CrmSheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="crm-ui-overlay" role="presentation">
      <button type="button" className="crm-ui-overlay-backdrop" aria-label="닫기" onClick={onClose} />
      <aside className="crm-ui-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="crm-ui-dialog-head">
          <h2>{title}</h2>
          <CrmButton variant="ghost" size="sm" onClick={onClose} aria-label="닫기">
            닫기
          </CrmButton>
        </div>
        <div className="crm-ui-sheet-body">{children}</div>
        {footer ? <div className="crm-ui-dialog-footer">{footer}</div> : null}
      </aside>
    </div>
  );
}

type MenuCtx = { close: () => void };
const MenuContext = createContext<MenuCtx>({ close: () => {} });

export function CrmMenu({
  trigger,
  align = "right",
  children,
}: {
  trigger: ReactNode;
  align?: "left" | "right";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const placePanel = () => {
    const btn = triggerRef.current;
    const panel = panelRef.current;
    if (!btn || !panel) return;
    const r = btn.getBoundingClientRect();
    const pw = panel.offsetWidth || 160;
    const ph = panel.offsetHeight || 140;
    const gap = 4;
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < ph + gap && r.top > ph + gap;
    let left = align === "right" ? r.right - pw : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    const top = openUp ? r.top - ph - gap : r.bottom + gap;
    setPos({ top, left });
  };

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    placePanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- place when open/align changes
  }, [open, align]);

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
  }, [open, align]);

  return (
    <div className="crm-ui-menu" ref={root}>
      <button
        ref={triggerRef}
        type="button"
        className="crm-ui-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              className="crm-ui-menu-panel crm-ui-menu-portal"
              role="menu"
              style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
            >
              <MenuContext.Provider value={{ close: () => setOpen(false) }}>{children}</MenuContext.Provider>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

export function CrmMenuItem({
  children,
  onClick,
  tone = "default",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
}) {
  const { close } = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitem"
      className={`crm-ui-menu-item${tone === "danger" ? " is-danger" : ""}`}
      disabled={disabled}
      onClick={() => {
        onClick?.();
        close();
      }}
    >
      {children}
    </button>
  );
}

export function IconDots() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="3" r="1.5" fill="currentColor" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
      <circle cx="8" cy="13" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <circle cx="6" cy="6" r="4.2" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path d="M9.2 9.2L12 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function IconCopy() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <rect x="4.5" y="4.5" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path d="M9.5 4.5V3.2A1.2 1.2 0 0 0 8.3 2H3.2A1.2 1.2 0 0 0 2 3.2v5.1A1.2 1.2 0 0 0 3.2 9.5H4.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
    </svg>
  );
}

export function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path d="M3 7.5l2.5 2.5L11 4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconExternal() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v6A1.5 1.5 0 0 0 3.5 12h6A1.5 1.5 0 0 0 11 10.5V8" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path d="M8 2h4v4M12 2L7 7" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
