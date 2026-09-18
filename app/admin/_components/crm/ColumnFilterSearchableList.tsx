"use client";

import { useMemo, useState } from "react";

type Option = { value: string; label: string };

type Props = {
  options: Option[];
  /** null이면 「전체」 선택 */
  selected: string | null;
  onSelect: (value: string | null) => void;
  searchPlaceholder?: string;
  ariaLabel?: string;
};

/** 헤더 컬럼 필터용 — 검색 후 단일 선택 목록 */
export default function ColumnFilterSearchableList({
  options,
  selected,
  onSelect,
  searchPlaceholder = "이름 검색",
  ariaLabel = "필터 옵션",
}: Props) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.label.toLowerCase().includes(needle));
  }, [options, q]);

  return (
    <div className="crm-col-filter-searchable">
      <input
        type="search"
        className="crm-col-filter-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
        autoFocus
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <div className="crm-col-filter-list" role="listbox" aria-label={ariaLabel}>
        <button
          type="button"
          role="option"
          className={selected == null ? "is-selected" : undefined}
          aria-selected={selected == null}
          onClick={() => onSelect(null)}
        >
          전체
        </button>
        {filtered.map((o) => (
          <button
            key={o.value}
            type="button"
            role="option"
            className={selected === o.value ? "is-selected" : undefined}
            aria-selected={selected === o.value}
            onClick={() => onSelect(o.value)}
          >
            {o.label}
          </button>
        ))}
        {options.length > 0 && filtered.length === 0 && (
          <div className="crm-col-filter-empty">검색 결과 없음</div>
        )}
      </div>
    </div>
  );
}
