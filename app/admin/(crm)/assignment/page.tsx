"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CrmAlert,
  CrmBadge,
  CrmButton,
  CrmChip,
  CrmEmptyState,
  CrmField,
  CrmInput,
  CrmPageHeader,
  CrmSelect,
  CrmSheet,
  CrmStatRow,
  CrmSwitch,
  IconPlus,
} from "@/app/admin/_components/crm/ui";
import { REGION_ZONE_NAMES } from "@/lib/crm/regionZones";

type Member = { id?: string; staff_user_id: string; weight: number; assigned_count?: number };
type Rule = {
  id: string;
  region_group: string;
  region_keywords: string[];
  enabled: boolean;
  members: Member[];
};
type Staff = { id: string; name: string; rank?: string; region?: string | null; is_active?: boolean };

function cloneRules(rules: Rule[]): Rule[] {
  return rules.map((r) => ({
    ...r,
    region_keywords: [...(r.region_keywords ?? [])],
    members: r.members.map((m) => ({ ...m })),
  }));
}

function ratios(members: Member[]): string[] {
  const total = members.reduce((s, m) => s + Math.max(0, Number(m.weight) || 0), 0);
  if (!total) return members.map(() => "0%");
  return members.map((m) => `${(((Math.max(0, Number(m.weight) || 0) / total) * 1000) | 0) / 10}%`);
}

function staffLabel(s: Staff): string {
  const rank = s.rank === "manager" ? "매니저" : "영업자";
  const region = s.region ? ` · ${s.region}` : "";
  return `${s.name} (${rank}${region})`;
}

function KeywordEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const parts = draft
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const set = new Set(value);
    for (const p of parts) set.add(p);
    onChange(Array.from(set));
    setDraft("");
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
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
      <div style={{ display: "flex", gap: 8 }}>
        <CrmInput
          value={draft}
          placeholder="예: 서울, 인천 (쉼표로 여러 개)"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <CrmButton type="button" size="sm" variant="secondary" onClick={add}>
          추가
        </CrmButton>
      </div>
    </div>
  );
}

export default function AssignmentPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [baseline, setBaseline] = useState<Rule[] | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applyingSheet, setApplyingSheet] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [sheetRuleId, setSheetRuleId] = useState<string | null>(null);
  const [draftMembers, setDraftMembers] = useState<Member[]>([]);
  const [draftKeywords, setDraftKeywords] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addingZone, setAddingZone] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneKeywords, setNewZoneKeywords] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/assignment");
      const d = await res.json();
      if (!d.ok) {
        setMessage({ tone: "danger", text: d.message || "불러오기 실패" });
        return;
      }
      const nextRules: Rule[] = d.rules ?? [];
      setRules(nextRules);
      setBaseline(cloneRules(nextRules));
      setStaff(d.staff ?? []);
      setMessage(null);
    } catch {
      setMessage({ tone: "danger", text: "네트워크 오류가 발생했습니다." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const dirty = useMemo(() => {
    if (!baseline) return false;
    return JSON.stringify(rules) !== JSON.stringify(baseline);
  }, [rules, baseline]);

  const assignableStaff = staff.filter((s) => {
    const rank = s.rank ?? "sales";
    return rank === "sales" || rank === "manager";
  });

  const activeRules = rules.filter((r) => r.enabled);
  const assigneeCount = new Set(
    activeRules.flatMap((r) => r.members.map((m) => m.staff_user_id).filter(Boolean))
  ).size;

  const sheetRule = rules.find((r) => r.id === sheetRuleId) ?? null;

  const openSettings = (rule: Rule) => {
    setSheetRuleId(rule.id);
    setDraftKeywords([...(rule.region_keywords ?? [])]);
    setDraftMembers(rule.members.length ? rule.members.map((m) => ({ ...m })) : [{ staff_user_id: "", weight: 1 }]);
  };

  const staffOptionsForZone = (zone: string) => {
    const preferred = assignableStaff.filter((s) => (s.region || "") === zone);
    const others = assignableStaff.filter((s) => (s.region || "") !== zone);
    return [...preferred, ...others];
  };

  const persistRules = async (nextRules: Rule[], successMsg: string) => {
    for (const r of nextRules) {
      if (!(r.region_keywords?.length > 0)) {
        setMessage({ tone: "danger", text: `"${r.region_group}" 포함 지역을 하나 이상 설정해 주세요.` });
        return false;
      }
      for (const m of r.members) {
        if (!(Number(m.weight) > 0)) {
          setMessage({ tone: "danger", text: `"${r.region_group}" 가중치는 1 이상이어야 합니다.` });
          return false;
        }
      }
    }
    try {
      const res = await fetch("/api/admin/assignment", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: nextRules }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMessage({ tone: "danger", text: data.message || "저장 실패" });
        return false;
      }
      await load();
      setMessage({ tone: "success", text: successMsg });
      return true;
    } catch {
      setMessage({ tone: "danger", text: "네트워크 오류가 발생했습니다." });
      return false;
    }
  };

  const applySheet = async () => {
    if (!sheetRuleId) return;
    if (!draftKeywords.length) {
      setMessage({ tone: "danger", text: "포함 지역을 하나 이상 입력해 주세요." });
      return;
    }
    const cleaned = draftMembers.filter((m) => m.staff_user_id && Number(m.weight) > 0);
    const nextRules = rules.map((r) =>
      r.id === sheetRuleId ? { ...r, region_keywords: [...draftKeywords], members: cleaned } : r
    );
    setApplyingSheet(true);
    setRules(nextRules);
    try {
      const ok = await persistRules(nextRules, "담당자 설정이 저장되었습니다.");
      if (ok) setSheetRuleId(null);
    } finally {
      setApplyingSheet(false);
    }
  };

  const addZone = async () => {
    const name = newZoneName.trim();
    if (!name) {
      setMessage({ tone: "danger", text: "권역 이름을 입력해 주세요." });
      return;
    }
    if (rules.some((r) => r.region_group === name)) {
      setMessage({ tone: "danger", text: `"${name}" 권역이 이미 있습니다.` });
      return;
    }
    if (!newZoneKeywords.length) {
      setMessage({ tone: "danger", text: "포함 지역을 하나 이상 입력해 주세요." });
      return;
    }
    setAddingZone(true);
    try {
      const res = await fetch("/api/admin/assignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region_group: name,
          region_keywords: newZoneKeywords,
          enabled: true,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMessage({ tone: "danger", text: data.message || "권역 추가에 실패했습니다." });
        return;
      }
      setAddOpen(false);
      setNewZoneName("");
      setNewZoneKeywords([]);
      await load();
      setMessage({ tone: "success", text: `"${name}" 권역이 추가되었습니다.` });
    } catch {
      setMessage({ tone: "danger", text: "네트워크 오류가 발생했습니다." });
    } finally {
      setAddingZone(false);
    }
  };

  const deleteZone = async (rule: Rule) => {
    const isFixed = REGION_ZONE_NAMES.includes(rule.region_group as (typeof REGION_ZONE_NAMES)[number]);
    if (isFixed) {
      setMessage({ tone: "danger", text: "기본 권역은 삭제할 수 없습니다." });
      return;
    }
    if (!window.confirm(`"${rule.region_group}" 권역을 삭제할까요? 담당자 배정 설정도 함께 삭제됩니다.`)) {
      return;
    }
    setDeletingId(rule.id);
    try {
      const res = await fetch(`/api/admin/assignment?id=${encodeURIComponent(rule.id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data.ok) {
        setMessage({ tone: "danger", text: data.message || "권역 삭제에 실패했습니다." });
        return;
      }
      if (sheetRuleId === rule.id) setSheetRuleId(null);
      await load();
      setMessage({ tone: "success", text: `"${rule.region_group}" 권역을 삭제했습니다.` });
    } catch {
      setMessage({ tone: "danger", text: "네트워크 오류가 발생했습니다." });
    } finally {
      setDeletingId(null);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await persistRules(rules, "저장되었습니다.");
    } finally {
      setSaving(false);
    }
  };

  const cancelChanges = () => {
    if (!baseline) return;
    setRules(cloneRules(baseline));
    setMessage(null);
  };

  return (
    <div className="crm-ui-content">
      <CrmPageHeader
        title="자동 분배 설정"
        description="고객의 지역에 따라 담당자를 자동으로 배정합니다. 가중치가 높을수록 더 많이 배정됩니다."
        actions={
          <CrmButton
            variant="secondary"
            size="sm"
            onClick={() => {
              setAddOpen(true);
              setNewZoneName("");
              setNewZoneKeywords([]);
            }}
          >
            <IconPlus /> 권역 추가
          </CrmButton>
        }
        meta={
          <CrmStatRow
            items={[
              { label: "활성 권역", value: activeRules.length },
              { label: "배정 대상자", value: assigneeCount },
            ]}
          />
        }
      />

      {message ? (
        <div style={{ marginBottom: 12 }}>
          <CrmAlert tone={message.tone}>{message.text}</CrmAlert>
        </div>
      ) : null}

      {loading ? (
        <div className="crm-skeleton" style={{ height: 240 }} />
      ) : rules.length === 0 ? (
        <CrmEmptyState
          title="권역 규칙이 없습니다"
          description="권역을 추가해 자동 배정을 시작하세요."
          action={
            <CrmButton variant="primary" onClick={() => setAddOpen(true)}>
              <IconPlus /> 권역 추가
            </CrmButton>
          }
        />
      ) : (
        <div className="crm-ui-table-shell">
          <table className="crm-ui-table">
            <thead>
              <tr>
                <th>권역</th>
                <th>포함 지역</th>
                <th>담당자</th>
                <th>가중치</th>
                <th>예상 비율</th>
                <th>상태</th>
                <th>설정</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const bases = rule.region_keywords?.length
                  ? rule.region_keywords
                  : [];
                const names = rule.members
                  .map((m) => assignableStaff.find((s) => s.id === m.staff_user_id)?.name || staff.find((s) => s.id === m.staff_user_id)?.name)
                  .filter(Boolean);
                const memberRatios = ratios(rule.members);
                const isFixed = REGION_ZONE_NAMES.includes(rule.region_group as (typeof REGION_ZONE_NAMES)[number]);
                return (
                  <tr key={rule.id} style={!rule.enabled ? { opacity: 0.55 } : undefined}>
                    <td style={{ fontWeight: 700 }} className="crm-cell-nowrap">
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {rule.region_group}
                        {!isFixed ? <CrmBadge tone="primary">추가</CrmBadge> : null}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxWidth: 320 }}>
                        {bases.slice(0, 8).map((b) => (
                          <CrmChip key={b}>{b}</CrmChip>
                        ))}
                        {bases.length > 8 ? <CrmChip>+{bases.length - 8}</CrmChip> : null}
                        {!bases.length ? <span className="crm-ui-hint">—</span> : null}
                      </div>
                    </td>
                    <td style={{ fontSize: 13 }}>{names.join(", ") || "—"}</td>
                    <td style={{ fontSize: 13 }}>{rule.members.map((m) => m.weight).join(", ") || "—"}</td>
                    <td style={{ fontSize: 13 }}>{memberRatios.join(" / ") || "—"}</td>
                    <td className="crm-cell-nowrap">
                      <CrmSwitch
                        checked={rule.enabled}
                        onChange={(v) => setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: v } : r)))}
                        label={rule.enabled ? "활성" : "비활성"}
                      />
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <CrmButton size="sm" variant="secondary" onClick={() => openSettings(rule)}>
                          설정
                        </CrmButton>
                        {!isFixed ? (
                          <CrmButton
                            size="sm"
                            variant="ghost"
                            disabled={deletingId === rule.id}
                            onClick={() => void deleteZone(rule)}
                          >
                            {deletingId === rule.id ? "삭제 중…" : "삭제"}
                          </CrmButton>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dirty && (
        <div className="crm-ui-sticky-bar">
          <CrmButton variant="secondary" onClick={cancelChanges} disabled={saving}>
            변경 취소
          </CrmButton>
          <CrmButton variant="primary" onClick={() => void save()} disabled={saving}>
            {saving ? "저장 중…" : "저장"}
          </CrmButton>
        </div>
      )}

      <CrmSheet
        open={!!sheetRule}
        onClose={() => !applyingSheet && setSheetRuleId(null)}
        title={`${sheetRule?.region_group ?? ""} 설정`}
        footer={
          <>
            <CrmButton variant="secondary" onClick={() => setSheetRuleId(null)} disabled={applyingSheet}>
              취소
            </CrmButton>
            <CrmButton variant="primary" onClick={() => void applySheet()} disabled={applyingSheet}>
              {applyingSheet ? "저장 중…" : "적용 및 저장"}
            </CrmButton>
          </>
        }
      >
        {sheetRule && (
          <>
            <CrmField
              label="포함 지역"
              hint="고객 지역 문자열에 포함되면 이 권역으로 매칭됩니다. 여러 개는 쉼표로 추가하세요."
            >
              <KeywordEditor value={draftKeywords} onChange={setDraftKeywords} />
            </CrmField>

            <CrmField
              label="담당자 · 가중치"
              hint="영업자와 매니저를 선택할 수 있습니다. 규칙에 추가된 담당자에게 자동 배정됩니다."
            >
              <div style={{ display: "grid", gap: 8 }}>
                {draftMembers.map((m, mi) => {
                  const ratio = ratios(draftMembers)[mi];
                  const options = staffOptionsForZone(sheetRule.region_group);
                  return (
                    <div key={mi} className="crm-assign-member-row">
                      <CrmSelect
                        value={m.staff_user_id}
                        onChange={(e) =>
                          setDraftMembers((prev) =>
                            prev.map((x, xi) => (xi === mi ? { ...x, staff_user_id: e.target.value } : x))
                          )
                        }
                      >
                        <option value="">담당자 선택</option>
                        {options.map((s) => (
                          <option key={s.id} value={s.id}>
                            {staffLabel(s)}
                          </option>
                        ))}
                      </CrmSelect>
                      <CrmInput
                        type="number"
                        min={1}
                        value={m.weight}
                        onChange={(e) =>
                          setDraftMembers((prev) =>
                            prev.map((x, xi) => (xi === mi ? { ...x, weight: Number(e.target.value) || 0 } : x))
                          )
                        }
                        aria-label="가중치"
                      />
                      <span style={{ fontSize: 13, color: "var(--crm-muted)" }}>{ratio}</span>
                      <CrmButton
                        size="sm"
                        variant="ghost"
                        onClick={() => setDraftMembers((prev) => prev.filter((_, xi) => xi !== mi))}
                      >
                        제거
                      </CrmButton>
                    </div>
                  );
                })}
                <CrmButton
                  size="sm"
                  variant="secondary"
                  onClick={() => setDraftMembers((prev) => [...prev, { staff_user_id: "", weight: 1 }])}
                >
                  <IconPlus /> 담당자 추가
                </CrmButton>
                {assignableStaff.length === 0 ? (
                  <p className="crm-ui-hint">활성 영업자·매니저가 없습니다. 계정 관리에서 계정을 확인해 주세요.</p>
                ) : null}
              </div>
            </CrmField>
          </>
        )}
      </CrmSheet>

      <CrmSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="권역 추가"
        footer={
          <>
            <CrmButton variant="secondary" onClick={() => setAddOpen(false)} disabled={addingZone}>
              취소
            </CrmButton>
            <CrmButton variant="primary" onClick={() => void addZone()} disabled={addingZone}>
              {addingZone ? "추가 중…" : "추가"}
            </CrmButton>
          </>
        }
      >
        <CrmField label="권역 이름">
          <CrmInput
            value={newZoneName}
            onChange={(e) => setNewZoneName(e.target.value)}
            placeholder="예: 해외권"
          />
        </CrmField>
        <CrmField label="포함 지역" hint="이 키워드가 고객 지역에 포함되면 해당 권역으로 배정합니다.">
          <KeywordEditor value={newZoneKeywords} onChange={setNewZoneKeywords} />
        </CrmField>
      </CrmSheet>
    </div>
  );
}
