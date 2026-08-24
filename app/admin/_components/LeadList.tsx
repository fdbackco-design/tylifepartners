"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatPhoneKorean } from "@/lib/phone";
import { allowedStatusesFor, rowBackground } from "@/lib/crm/status";
import type { LeadCategory, LeadRow, LeadStatus, SessionUser } from "@/lib/crm/types";

type StaffOpt = { id: string; name: string; parent_id: string | null };

function MultiSelect({
  label,
  values,
  selected,
  onChange,
}: {
  label: string;
  values: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", minWidth: 140 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", textAlign: "left", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "#fff", fontSize: 13 }}
      >
        {label} {selected.length ? `(${selected.length})` : ""}
      </button>
      {open && (
        <div style={{ position: "absolute", zIndex: 5, top: "110%", left: 0, minWidth: "100%", background: "#fff", border: "1px solid var(--border)", borderRadius: 8, maxHeight: 220, overflow: "auto", padding: 8 }}>
          {values.length === 0 && <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>값 없음</div>}
          {values.map((v) => (
            <label key={v} style={{ display: "flex", gap: 6, fontSize: 13, padding: "4px 0" }}>
              <input
                type="checkbox"
                checked={selected.includes(v)}
                onChange={() => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])}
              />
              {v.includes("|") ? v.split("|")[1] : v}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LeadList({ category, recontact }: { category: LeadCategory | "all"; recontact?: boolean }) {
  const [session, setSession] = useState<Pick<SessionUser, "rank" | "userId" | "name"> | null>(null);
  const [items, setItems] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [staff, setStaff] = useState<StaffOpt[]>([]);
  const [options, setOptions] = useState({
    regions: [] as string[],
    age_groups: [] as string[],
    jobs: [] as string[],
    job_ranks: [] as string[],
    entry_pages: [] as string[],
    utm_sources: [] as string[],
  });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [jobRanks, setJobRanks] = useState<string[]>([]);
  const [ageGroups, setAgeGroups] = useState<string[]>([]);
  const [jobs, setJobs] = useState<string[]>([]);
  const [entryPages, setEntryPages] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [editingMemo, setEditingMemo] = useState<LeadRow | null>(null);
  const pageSize = 30;

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("category", category);
    sp.set("limit", String(pageSize));
    sp.set("offset", String(page * pageSize));
    if (recontact) sp.set("recontact", "1");
    if (search) sp.set("search", search);
    if (assigneeIds.length) sp.set("assignee_ids", assigneeIds.join(","));
    if (teamIds.length) sp.set("team_ids", teamIds.join(","));
    if (regions.length) sp.set("regions", regions.join(","));
    if (statuses.length) sp.set("statuses", statuses.join(","));
    if (jobRanks.length) sp.set("job_ranks", jobRanks.join(","));
    if (ageGroups.length) sp.set("age_groups", ageGroups.join(","));
    if (jobs.length) sp.set("jobs", jobs.join(","));
    if (entryPages.length) sp.set("entry_pages", entryPages.join(","));
    if (dateFrom) sp.set("date_from", dateFrom);
    if (dateTo) sp.set("date_to", dateTo);
    return sp.toString();
  }, [category, recontact, search, page, assigneeIds, teamIds, regions, statuses, jobRanks, ageGroups, jobs, entryPages, dateFrom, dateTo]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/leads?${query}`);
    const data = await res.json();
    if (res.status === 401) {
      window.location.href = "/admin";
      return;
    }
    if (data.ok) {
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setStaff(data.staff ?? []);
      if (data.session) setSession(data.session);
      if (data.options) setOptions(data.options);
    }
    setLoading(false);
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (row: LeadRow, body: Record<string, unknown>) => {
    const cat = row.type === "후보자" ? "candidates" : "consumers";
    const res = await fetch(`/api/admin/leads/${row.id}?category=${cat}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.ok && data.item) {
      setItems((prev) => prev.map((x) => (x.id === row.id ? data.item : x)));
    } else {
      alert(data.message || "저장 실패");
    }
  };

  const download = (format: "xls" | "csv") => {
    const sp = new URLSearchParams(query);
    sp.set("format", format);
    sp.set("limit", "5000");
    sp.set("offset", "0");
    window.location.href = `/api/admin/leads/export?${sp.toString()}`;
  };

  const managers = staff.filter((s, _, arr) => arr.some((o) => o.parent_id === s.id) || s.parent_id == null);
  const showAdmin = session?.rank === "admin" || session?.rank === "manager";
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input
          placeholder="이름 또는 연락처 검색"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          style={{ flex: 1, minWidth: 200, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8 }}
        />
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <button type="button" onClick={() => download("xls")} style={{ padding: "8px 12px", background: "var(--cta-bg)", color: "#fff", border: 0, borderRadius: 8, fontWeight: 700 }}>
          엑셀 다운로드
        </button>
        <button type="button" onClick={() => download("csv")} style={{ padding: "8px 12px", border: "1px solid var(--border)", background: "#fff", borderRadius: 8 }}>
          CSV
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <MultiSelect
          label="담당자"
          values={staff.map((s) => `${s.id}|${s.name}`)}
          selected={assigneeIds.map((id) => `${id}|${staff.find((s) => s.id === id)?.name ?? id}`)}
          onChange={(vals) => setAssigneeIds(vals.map((v) => v.split("|")[0]))}
        />
        {showAdmin && (
          <MultiSelect
            label="팀"
            values={managers.map((s) => `${s.id}|${s.name}`)}
            selected={teamIds.map((id) => `${id}|${staff.find((s) => s.id === id)?.name ?? id}`)}
            onChange={(vals) => setTeamIds(vals.map((v) => v.split("|")[0]))}
          />
        )}
        <MultiSelect label="지역" values={options.regions} selected={regions} onChange={setRegions} />
        <MultiSelect label="상담상태" values={["배정전", "대기", "1차컨택", "부재(메신저완료)", "상담완료", "대면확정", "가입완료"]} selected={statuses} onChange={setStatuses} />
        <MultiSelect label="직급" values={options.job_ranks} selected={jobRanks} onChange={setJobRanks} />
        <MultiSelect label="연령대" values={options.age_groups} selected={ageGroups} onChange={setAgeGroups} />
        <MultiSelect label="직업" values={options.jobs} selected={jobs} onChange={setJobs} />
        <MultiSelect label="유입페이지" values={options.entry_pages} selected={entryPages} onChange={setEntryPages} />
      </div>
      <div style={{ marginBottom: 8, color: "var(--text-secondary)", fontSize: 13 }}>총 {total.toLocaleString()}건</div>
      {loading ? (
        <div style={{ padding: 40, textAlign: "center" }}>로딩 중...</div>
      ) : (
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th>미리보기</th>
                <th>신청시간</th>
                <th>이름</th>
                <th>연락처</th>
                <th>유입페이지</th>
                <th>지역</th>
                <th>상담가능시간</th>
                <th>연령대</th>
                <th>직업</th>
                <th>직급</th>
                <th>유입경로</th>
                <th>담당자</th>
                {showAdmin && <th>관리자상태</th>}
                <th>상담상태</th>
                <th>메모</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const allowed = session ? allowedStatusesFor(session as SessionUser, row.status) : [row.status];
                return (
                  <tr key={row.id} style={{ background: rowBackground(row.status) }}>
                    <td>
                      <img className="thumb" src={row.landing_preview} alt="" />
                    </td>
                    <td style={{ whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{row.created_at}</td>
                    <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{row.name}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{formatPhoneKorean(row.phone)}</td>
                    <td>{row.entry_page || "-"}</td>
                    <td>{row.region || "-"}</td>
                    <td>{row.available_time || "-"}</td>
                    <td>{row.age_group || "-"}</td>
                    <td>{row.job || "-"}</td>
                    <td>{row.job_rank || "-"}</td>
                    <td title={`${row.utm_source}/${row.utm_medium}/${row.utm_campaign}`}>{row.utm_source || "-"}</td>
                    <td>
                      {showAdmin ? (
                        <select value={row.assignee_id ?? ""} onChange={(e) => void patch(row, { assignee_id: e.target.value || null })}>
                          <option value="">미배정</option>
                          {staff.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        row.assignee_name || "-"
                      )}
                    </td>
                    {showAdmin && <td>{row.admin_status ? <span className="admin-tag">{row.admin_status.label}</span> : "-"}</td>}
                    <td>
                      <select value={row.status} onChange={(e) => void patch(row, { status: e.target.value as LeadStatus })}>
                        {(allowed.includes(row.status) ? allowed : [row.status, ...allowed]).map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      {row.status === "대면확정" && (
                        <input
                          type="datetime-local"
                          value={row.meeting_at ? row.meeting_at.slice(0, 16) : ""}
                          onChange={(e) => void patch(row, { meeting_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                          style={{ display: "block", marginTop: 6 }}
                        />
                      )}
                    </td>
                    <td onDoubleClick={() => row.status !== "대기" && setEditingMemo(row)}>
                      <textarea
                        value={row.memo}
                        disabled={row.status === "대기"}
                        rows={2}
                        onChange={(e) => setItems((prev) => prev.map((x) => (x.id === row.id ? { ...x, memo: e.target.value } : x)))}
                        onBlur={(e) => row.status !== "대기" && void patch(row, { memo: e.target.value })}
                        style={{ width: 180, minHeight: 48, fontFamily: "inherit" }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
          <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            이전
          </button>
          <span>
            {page + 1} / {pages}
          </span>
          <button type="button" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
            다음
          </button>
        </div>
      )}
      {editingMemo && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", zIndex: 50 }}
          onClick={() => setEditingMemo(null)}
        >
          <div style={{ background: "#fff", padding: 16, borderRadius: 12, width: "min(720px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{editingMemo.name} 메모</h3>
            <textarea
              value={editingMemo.memo}
              rows={12}
              style={{ width: "100%", fontFamily: "inherit" }}
              onChange={(e) => setEditingMemo({ ...editingMemo, memo: e.target.value })}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button type="button" onClick={() => setEditingMemo(null)}>
                닫기
              </button>
              <button
                type="button"
                onClick={() => {
                  void patch(editingMemo, { memo: editingMemo.memo });
                  setEditingMemo(null);
                }}
                style={{ background: "var(--cta-bg)", color: "#fff", border: 0, borderRadius: 8, padding: "8px 14px" }}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
