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
import { ZONE_BASE_LABELS, type RegionZoneName } from "@/lib/crm/regionZones";

type Member = { id?: string; staff_user_id: string; weight: number; assigned_count?: number };
type Rule = {
  id: string;
  region_group: RegionZoneName | string;
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

export default function AssignmentPage() {
  const [enabled, setEnabled] = useState(true);
  const [rules, setRules] = useState<Rule[]>([]);
  const [baseline, setBaseline] = useState<{ enabled: boolean; rules: Rule[] } | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [sheetRuleId, setSheetRuleId] = useState<string | null>(null);
  const [draftMembers, setDraftMembers] = useState<Member[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/assignment");
      const d = await res.json();
      if (!d.ok) {
        setMessage({ tone: "danger", text: d.message || "불러오기 실패" });
        return;
      }
      const nextEnabled = d.auto_assign_enabled !== false;
      const nextRules: Rule[] = d.rules ?? [];
      setEnabled(nextEnabled);
      setRules(nextRules);
      setBaseline({ enabled: nextEnabled, rules: cloneRules(nextRules) });
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
    return JSON.stringify({ enabled, rules }) !== JSON.stringify(baseline);
  }, [enabled, rules, baseline]);

  const salesStaff = staff.filter((s) => (s.rank ?? "sales") === "sales");
  const activeRules = rules.filter((r) => r.enabled);
  const assigneeCount = new Set(
    activeRules.flatMap((r) => r.members.map((m) => m.staff_user_id).filter(Boolean))
  ).size;

  const sheetRule = rules.find((r) => r.id === sheetRuleId) ?? null;

  const openSettings = (rule: Rule) => {
    setSheetRuleId(rule.id);
    setDraftMembers(rule.members.length ? rule.members.map((m) => ({ ...m })) : [{ staff_user_id: "", weight: 1 }]);
  };

  const salesForZone = (zone: string) => salesStaff.filter((s) => (s.region || "") === zone);

  const applySheet = () => {
    if (!sheetRuleId) return;
    const cleaned = draftMembers.filter((m) => m.staff_user_id && Number(m.weight) > 0);
    setRules((prev) => prev.map((r) => (r.id === sheetRuleId ? { ...r, members: cleaned } : r)));
    setSheetRuleId(null);
  };

  const save = async () => {
    for (const r of rules) {
      for (const m of r.members) {
        if (!(Number(m.weight) > 0)) {
          setMessage({ tone: "danger", text: `"${r.region_group}" 가중치는 1 이상이어야 합니다.` });
          return;
        }
      }
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/assignment", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_assign_enabled: enabled, rules }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMessage({ tone: "danger", text: data.message || "저장 실패" });
        return;
      }
      setMessage({ tone: "success", text: "저장되었습니다." });
      await load();
    } catch {
      setMessage({ tone: "danger", text: "네트워크 오류가 발생했습니다." });
    } finally {
      setSaving(false);
    }
  };

  const cancelChanges = () => {
    if (!baseline) return;
    setEnabled(baseline.enabled);
    setRules(cloneRules(baseline.rules));
    setMessage(null);
  };

  return (
    <div className="crm-ui-content">
      <CrmPageHeader
        title="자동 분배 설정"
        description="고객의 지역에 따라 담당자를 자동으로 배정합니다. 가중치가 높을수록 더 많이 배정됩니다."
        actions={
          <CrmSwitch checked={enabled} onChange={setEnabled} label={enabled ? "자동 배정 On" : "자동 배정 Off"} />
        }
        meta={
          <CrmStatRow
            items={[
              { label: "자동 배정", value: enabled ? "사용 중" : "중지" },
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

      {!enabled ? (
        <div style={{ marginBottom: 12 }}>
          <CrmAlert tone="info">자동 배정이 꺼져 있으면 신규 상담은 배정전으로 유지됩니다.</CrmAlert>
        </div>
      ) : null}

      {loading ? (
        <div className="crm-skeleton" style={{ height: 240 }} />
      ) : rules.length === 0 ? (
        <CrmEmptyState title="권역 규칙을 불러오지 못했습니다" description="잠시 후 다시 시도해 주세요." />
      ) : (
        <div className="crm-ui-table-shell">
          <table className="crm-ui-table">
            <thead>
              <tr>
                <th>권역</th>
                <th>포함 지역</th>
                <th>담당 영업자</th>
                <th>가중치</th>
                <th>예상 비율</th>
                <th>상태</th>
                <th>설정</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const zone = rule.region_group as RegionZoneName;
                const bases = ZONE_BASE_LABELS[zone] ?? rule.region_keywords ?? [];
                const names = rule.members
                  .map((m) => salesStaff.find((s) => s.id === m.staff_user_id)?.name || staff.find((s) => s.id === m.staff_user_id)?.name)
                  .filter(Boolean);
                const memberRatios = ratios(rule.members);
                return (
                  <tr key={rule.id} style={!enabled || !rule.enabled ? { opacity: 0.55 } : undefined}>
                    <td style={{ fontWeight: 700 }}>{rule.region_group}</td>
                    <td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {bases.map((b) => (
                          <CrmChip key={b}>{b}</CrmChip>
                        ))}
                      </div>
                    </td>
                    <td style={{ fontSize: 13 }}>{names.join(", ") || "—"}</td>
                    <td style={{ fontSize: 13 }}>{rule.members.map((m) => m.weight).join(", ") || "—"}</td>
                    <td style={{ fontSize: 13 }}>{memberRatios.join(" / ") || "—"}</td>
                    <td>
                      <CrmSwitch
                        checked={rule.enabled}
                        disabled={!enabled}
                        onChange={(v) => setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: v } : r)))}
                        label={rule.enabled ? "활성" : "비활성"}
                      />
                    </td>
                    <td>
                      <CrmButton size="sm" variant="secondary" onClick={() => openSettings(rule)} disabled={!enabled}>
                        설정
                      </CrmButton>
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
        onClose={() => setSheetRuleId(null)}
        title={`${sheetRule?.region_group ?? ""} 담당자 설정`}
        footer={
          <>
            <CrmButton variant="secondary" onClick={() => setSheetRuleId(null)}>
              취소
            </CrmButton>
            <CrmButton variant="primary" onClick={applySheet}>
              적용
            </CrmButton>
          </>
        }
      >
        {sheetRule && (
          <>
            <CrmAlert tone="info">
              포함 지역: {(ZONE_BASE_LABELS[sheetRule.region_group as RegionZoneName] ?? []).join(", ")} (수정 불가)
            </CrmAlert>
            <CrmField label="담당 영업자 · 가중치" hint="해당 권역이 설정된 영업자만 선택할 수 있습니다.">
              <div style={{ display: "grid", gap: 8 }}>
                {draftMembers.map((m, mi) => {
                  const ratio = ratios(draftMembers)[mi];
                  const options = salesForZone(sheetRule.region_group);
                  return (
                    <div key={mi} style={{ display: "grid", gridTemplateColumns: "1fr 88px 72px auto", gap: 8, alignItems: "center" }}>
                      <CrmSelect
                        value={m.staff_user_id}
                        onChange={(e) =>
                          setDraftMembers((prev) =>
                            prev.map((x, xi) => (xi === mi ? { ...x, staff_user_id: e.target.value } : x))
                          )
                        }
                      >
                        <option value="">영업자 선택</option>
                        {options.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
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
                {salesForZone(sheetRule.region_group).length === 0 ? (
                  <p className="crm-ui-hint">이 권역으로 설정된 영업자가 없습니다. 계정 관리에서 담당 권역을 지정해 주세요.</p>
                ) : null}
              </div>
            </CrmField>
          </>
        )}
      </CrmSheet>
    </div>
  );
}
