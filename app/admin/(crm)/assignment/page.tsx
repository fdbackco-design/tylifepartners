"use client";

import { useEffect, useState } from "react";

type Member = { id?: string; staff_user_id: string; weight: number; assigned_count?: number };
type Rule = {
  id?: string;
  region_group: string;
  region_keywords: string[];
  enabled: boolean;
  members: Member[];
};

export default function AssignmentPage() {
  const [enabled, setEnabled] = useState(true);
  const [rules, setRules] = useState<Rule[]>([]);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [message, setMessage] = useState("");

  const load = () => {
    fetch("/api/admin/assignment")
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) return;
        setEnabled(d.auto_assign_enabled !== false);
        setRules(d.rules ?? []);
        setStaff(d.staff ?? []);
      });
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    const res = await fetch("/api/admin/assignment", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auto_assign_enabled: enabled, rules }),
    });
    const data = await res.json();
    setMessage(data.ok ? "저장되었습니다." : data.message || "저장 실패");
    if (data.ok) load();
  };

  return (
    <div>
      <h1 className="crm-page-title">지역 자동배정</h1>
      <p className="crm-page-desc">
        고객 지역 키워드에 맞는 영업자에게 자동으로 담당자를 붙입니다. 가중치가 높을수록 더 많이 배정됩니다. 기본값은 켜짐입니다.
      </p>
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        자동배정 사용
      </label>
      {rules.map((rule, idx) => (
        <div key={rule.id ?? idx} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              value={rule.region_group}
              onChange={(e) => setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, region_group: e.target.value } : r)))}
              placeholder="권역명 (예: 수도권)"
            />
            <label>
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={(e) => setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, enabled: e.target.checked } : r)))}
              />{" "}
              사용
            </label>
          </div>
          <input
            value={rule.region_keywords.join(",")}
            onChange={(e) =>
              setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, region_keywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } : r)))
            }
            placeholder="지역 키워드 (쉼표로 구분)"
            style={{ width: "100%", marginBottom: 8 }}
          />
          {rule.members.map((m, mi) => (
            <div key={mi} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <select
                value={m.staff_user_id}
                onChange={(e) =>
                  setRules((prev) =>
                    prev.map((r, i) =>
                      i === idx ? { ...r, members: r.members.map((x, xi) => (xi === mi ? { ...x, staff_user_id: e.target.value } : x)) } : r
                    )
                  )
                }
              >
                <option value="">영업자 선택</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={m.weight}
                onChange={(e) =>
                  setRules((prev) =>
                    prev.map((r, i) =>
                      i === idx ? { ...r, members: r.members.map((x, xi) => (xi === mi ? { ...x, weight: Number(e.target.value) || 1 } : x)) } : r
                    )
                  )
                }
                style={{ width: 80 }}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, members: [...r.members, { staff_user_id: "", weight: 1 }] } : r)))}
          >
            담당자 추가
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setRules((prev) => [...prev, { region_group: "", region_keywords: [], enabled: true, members: [] }])}>
        권역 추가
      </button>
      <div style={{ marginTop: 16 }}>
        <button type="button" onClick={() => void save()} style={{ background: "var(--cta-bg)", color: "#fff", border: 0, borderRadius: 8, padding: "10px 16px", fontWeight: 700 }}>
          저장
        </button>
        {message && <span style={{ marginLeft: 8 }}>{message}</span>}
      </div>
    </div>
  );
}
