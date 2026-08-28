"use client";

import { useMemo, useState } from "react";
import {
  BASE_REGIONS,
  formatRegionValue,
  getDistrictsForRegion,
  isBaseRegion,
  REGION_GROUPS,
  type BaseRegion,
} from "@/lib/regions";
import { CrmButton, CrmChip, CrmInput, CrmSelect } from "@/app/admin/_components/crm/ui";

function mergeKeywords(current: string[], add: string[]): string[] {
  const set = new Set(current);
  for (const kw of add) {
    const t = kw.trim();
    if (t) set.add(t);
  }
  return Array.from(set);
}

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  /** 상세 지역을 새 권역으로 만들 때 (자동 분배 권역 추가 시트) */
  onCreateSubZone?: (zoneName: string, keywords: string[]) => void;
};

export default function RegionKeywordPicker({ value, onChange, onCreateSubZone }: Props) {
  const [draft, setDraft] = useState("");
  const [baseRegion, setBaseRegion] = useState<BaseRegion | "">("");
  const [district, setDistrict] = useState("");

  const districts = useMemo(
    () => (baseRegion ? getDistrictsForRegion(baseRegion) : []),
    [baseRegion]
  );

  const addManual = () => {
    const parts = draft
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    onChange(mergeKeywords(value, parts));
    setDraft("");
  };

  const addBaseOnly = () => {
    if (!baseRegion) return;
    onChange(mergeKeywords(value, [baseRegion]));
  };

  const addDetail = () => {
    if (!baseRegion || !district) return;
    onChange(mergeKeywords(value, [formatRegionValue(baseRegion, district)]));
  };

  const addAllDistricts = () => {
    if (!baseRegion) return;
    const kws = districts.map((d) => formatRegionValue(baseRegion, d));
    onChange(mergeKeywords(value, kws));
  };

  const createSubZoneFromDetail = () => {
    if (!baseRegion || !district || !onCreateSubZone) return;
    const label = formatRegionValue(baseRegion, district);
    onCreateSubZone(label, [label, district]);
    setDistrict("");
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {value.length ? (
          value.map((kw) => (
            <CrmChip key={kw} onRemove={() => onChange(value.filter((x) => x !== kw))}>
              {kw}
            </CrmChip>
          ))
        ) : (
          <span className="crm-ui-hint">포함 지역이 없습니다.</span>
        )}
      </div>

      <div
        style={{
          padding: 12,
          border: "1px solid var(--crm-border)",
          borderRadius: 10,
          background: "#fafafa",
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--crm-muted)" }}>
          랜딩페이지와 동일한 지역·상세 선택
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {REGION_GROUPS.map((g) => (
            <span key={g.zone} className="crm-ui-hint" style={{ fontSize: 11 }}>
              <strong style={{ color: "var(--crm-text)" }}>{g.zone}</strong>{" "}
              {g.regions.join(" · ")}
            </span>
          ))}
        </div>

        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
          <CrmSelect
            value={baseRegion}
            onChange={(e) => {
              const next = e.target.value;
              setBaseRegion(isBaseRegion(next) ? next : "");
              setDistrict("");
            }}
            aria-label="시·도 선택"
          >
            <option value="">시·도 선택</option>
            {BASE_REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </CrmSelect>

          <CrmSelect
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            disabled={!baseRegion || districts.length === 0}
            aria-label="상세 지역 선택"
          >
            <option value="">
              {!baseRegion
                ? "시·도를 먼저 선택"
                : districts.length
                  ? "상세 지역 선택 (선택)"
                  : "상세 목록 없음"}
            </option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </CrmSelect>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <CrmButton type="button" size="sm" variant="secondary" disabled={!baseRegion} onClick={addBaseOnly}>
            시·도 추가
          </CrmButton>
          <CrmButton
            type="button"
            size="sm"
            variant="secondary"
            disabled={!baseRegion || !district}
            onClick={addDetail}
          >
            상세 지역 추가
          </CrmButton>
          <CrmButton
            type="button"
            size="sm"
            variant="ghost"
            disabled={!baseRegion || districts.length === 0}
            onClick={addAllDistricts}
          >
            시·도 내 전체 상세 추가
          </CrmButton>
          {onCreateSubZone ? (
            <CrmButton
              type="button"
              size="sm"
              variant="primary"
              disabled={!baseRegion || !district}
              onClick={createSubZoneFromDetail}
            >
              상세 지역을 새 권역으로
            </CrmButton>
          ) : null}
        </div>

        <p className="crm-ui-hint" style={{ margin: 0 }}>
          상세 지역(예: 경기 수원시) 키워드가 더 길면 시·도 전체(경기)보다 우선 매칭됩니다. 수원·화성 등
          담당자를 나누려면 각각「상세 지역을 새 권역으로」를 사용하세요.
        </p>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <CrmInput
          value={draft}
          placeholder="직접 입력 (예: 해외거주) — 쉼표로 여러 개"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addManual();
            }
          }}
        />
        <CrmButton type="button" size="sm" variant="secondary" onClick={addManual}>
          추가
        </CrmButton>
      </div>
    </div>
  );
}
