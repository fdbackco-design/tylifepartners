"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatPhoneKorean } from "@/lib/phone";
import { fromKstHourLocalInput, toKstHourLocalInput } from "@/lib/crm/kst";
import { ADMIN_STATUS_FILTER_OPTIONS, allowedStatusesFor, isMemoEditable, rowBackground } from "@/lib/crm/status";
import { formatKstDateTime } from "@/lib/crm/kst";
import { formatYmdDot } from "@/lib/crm/ui";
import type { LeadCategory, LeadRow, LeadStatus, SessionUser } from "@/lib/crm/types";
import AssigneePicker from "@/app/admin/_components/crm/AssigneePicker";
import DateRangePicker from "@/app/admin/_components/crm/DateRangePicker";
import FilterPopover, { type FilterGroup } from "@/app/admin/_components/crm/FilterPopover";
import StatusBadgeMenu from "@/app/admin/_components/crm/StatusBadgeMenu";
import { formatAssigneeWithTeam } from "@/lib/crm/assigneeHistoryFormat";

type StaffOpt = { id: string; name: string; parent_id: string | null; rank?: string };

function csvParam(v: string | null): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function formatAssignedAt(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "-";
  return formatKstDateTime(d);
}

export default function LeadList({
  category,
  needReassign,
  title,
  description,
}: {
  category: LeadCategory | "all";
  needReassign?: boolean;
  title?: string;
  description?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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
  const [searchInput, setSearchInput] = useState(searchParams.get("search") ?? "");
  const search = useDebounced(searchInput, 350);
  const [page, setPage] = useState(Number(searchParams.get("page") || 0));
  const [pageSize, setPageSize] = useState(Number(searchParams.get("limit") || 20));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [patchingAssigneeIds, setPatchingAssigneeIds] = useState<Set<string>>(() => new Set());
  const [assigneeIds, setAssigneeIds] = useState(csvParam(searchParams.get("assignee_ids")));
  const [teamIds, setTeamIds] = useState(csvParam(searchParams.get("team_ids")));
  const [regions, setRegions] = useState(csvParam(searchParams.get("regions")));
  const [statuses, setStatuses] = useState(csvParam(searchParams.get("statuses")));
  const [adminStatuses, setAdminStatuses] = useState(csvParam(searchParams.get("admin_statuses")));
  const [jobRanks, setJobRanks] = useState(csvParam(searchParams.get("job_ranks")));
  const [ageGroups, setAgeGroups] = useState(csvParam(searchParams.get("age_groups")));
  const [jobs, setJobs] = useState(csvParam(searchParams.get("jobs")));
  const [entryPages, setEntryPages] = useState(csvParam(searchParams.get("entry_pages")));
  const [dateFrom, setDateFrom] = useState(searchParams.get("date_from") ?? "");
  const [dateTo, setDateTo] = useState(searchParams.get("date_to") ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [memoRow, setMemoRow] = useState<LeadRow | null>(null);
  const [memoLogs, setMemoLogs] = useState<{ id: string; assignee_name: string; memo: string; created_at: string }[]>([]);
  const [memoSaveStatus, setMemoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const memoSavedRef = useRef<string>("");
  const memoRowRef = useRef<LeadRow | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Map<string, "consumers" | "candidates">>(new Map());
  const [bulkAssigneeId, setBulkAssigneeId] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Sync filters to URL
  useEffect(() => {
    const sp = new URLSearchParams();
    if (search) sp.set("search", search);
    if (dateFrom) sp.set("date_from", dateFrom);
    if (dateTo) sp.set("date_to", dateTo);
    if (assigneeIds.length) sp.set("assignee_ids", assigneeIds.join(","));
    if (teamIds.length) sp.set("team_ids", teamIds.join(","));
    if (regions.length) sp.set("regions", regions.join(","));
    if (statuses.length) sp.set("statuses", statuses.join(","));
    if (adminStatuses.length) sp.set("admin_statuses", adminStatuses.join(","));
    if (jobRanks.length) sp.set("job_ranks", jobRanks.join(","));
    if (ageGroups.length) sp.set("age_groups", ageGroups.join(","));
    if (jobs.length) sp.set("jobs", jobs.join(","));
    if (entryPages.length) sp.set("entry_pages", entryPages.join(","));
    if (page > 0) sp.set("page", String(page));
    if (pageSize !== 20) sp.set("limit", String(pageSize));
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [
    search,
    dateFrom,
    dateTo,
    assigneeIds,
    teamIds,
    regions,
    statuses,
    adminStatuses,
    jobRanks,
    ageGroups,
    jobs,
    entryPages,
    page,
    pageSize,
    pathname,
    router,
  ]);

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("category", category);
    sp.set("limit", String(pageSize));
    sp.set("offset", String(page * pageSize));
    if (needReassign) sp.set("need_reassign", "1");
    if (search) sp.set("search", search);
    if (assigneeIds.length) sp.set("assignee_ids", assigneeIds.join(","));
    if (teamIds.length) sp.set("team_ids", teamIds.join(","));
    if (regions.length) sp.set("regions", regions.join(","));
    if (statuses.length) sp.set("statuses", statuses.join(","));
    if (adminStatuses.length) sp.set("admin_statuses", adminStatuses.join(","));
    if (jobRanks.length) sp.set("job_ranks", jobRanks.join(","));
    if (ageGroups.length) sp.set("age_groups", ageGroups.join(","));
    if (jobs.length) sp.set("jobs", jobs.join(","));
    if (entryPages.length) sp.set("entry_pages", entryPages.join(","));
    if (dateFrom) sp.set("date_from", dateFrom);
    if (dateTo) sp.set("date_to", dateTo);
    return sp.toString();
  }, [
    category,
    needReassign,
    search,
    page,
    pageSize,
    assigneeIds,
    teamIds,
    regions,
    statuses,
    adminStatuses,
    jobRanks,
    ageGroups,
    jobs,
    entryPages,
    dateFrom,
    dateTo,
  ]);

  const loadGenRef = useRef(0);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    const gen = ++loadGenRef.current;
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const res = await fetch(`/api/admin/leads?${query}`);
      const data = await res.json();
      if (gen !== loadGenRef.current) return;
      if (res.status === 401) {
        window.location.href = "/admin";
        return;
      }
      if (!data.ok) {
        if (!silent) {
          setError(data.message || "조회에 실패했습니다.");
          setItems([]);
          setTotal(0);
        }
        return;
      }
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setStaff(data.staff ?? []);
      if (!silent) setSelectedIds(new Map());
      if (data.session) setSession(data.session);
      if (data.options) setOptions(data.options);
    } catch {
      if (gen !== loadGenRef.current) return;
      if (!silent) setError("네트워크 오류가 발생했습니다.");
    } finally {
      if (gen === loadGenRef.current && !silent) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  // 열려 있는 DB 탭에서 새 상담신청이 목록에 자동 반영되도록 조용히 갱신
  useEffect(() => {
    const POLL_MS = 15_000;
    let timer: ReturnType<typeof setInterval> | null = null;

    const clear = () => {
      if (timer != null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const schedule = () => {
      clear();
      timer = setInterval(() => {
        if (document.hidden) return;
        void load({ silent: true });
      }, POLL_MS);
    };

    const onVisibility = () => {
      if (document.hidden) {
        clear();
        return;
      }
      void load({ silent: true });
      schedule();
    };

    if (!document.hidden) schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
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
      if (memoRowRef.current?.id === row.id) {
        if (body.memo != null) {
          setMemoRow((prev) => (prev ? { ...data.item, memo: prev.memo } : data.item));
        } else {
          setMemoRow(data.item);
        }
      }
      return data.item as LeadRow;
    }
    alert(data.message || "저장 실패");
    return null;
  };

  const patchAssignee = async (row: LeadRow, nextId: string | null) => {
    if (patchingAssigneeIds.has(row.id)) return;
    if ((row.assignee_id ?? null) === nextId) return;

    const snapshot = row;
    const nextStaff = nextId ? staff.find((s) => s.id === nextId) : null;
    const parentName = nextStaff?.parent_id
      ? staff.find((s) => s.id === nextStaff.parent_id)?.name ?? row.team_name
      : "";
    const optimistic: LeadRow = {
      ...row,
      assignee_id: nextId,
      assignee_name: nextStaff?.name ?? "",
      team_name: parentName,
      assigned_at: nextId ? new Date().toISOString() : null,
      assignee_history:
        nextStaff?.name && row.assignee_name && row.assignee_name !== nextStaff.name
          ? [...(row.assignee_history?.length ? row.assignee_history : [row.assignee_name]), nextStaff.name]
          : row.assignee_history,
    };
    // 미배정→지정 시 배정전은 대기로 바뀌는 서버 규칙과 UI를 맞춤
    if (nextId && row.status === "배정전") {
      optimistic.status = "대기";
    }

    setPatchingAssigneeIds((prev) => {
      const next = new Set(prev);
      next.add(row.id);
      return next;
    });
    setItems((prev) => prev.map((x) => (x.id === row.id ? optimistic : x)));

    try {
      const saved = await patch(row, { assignee_id: nextId });
      if (!saved) {
        setItems((prev) => prev.map((x) => (x.id === row.id ? snapshot : x)));
      }
    } catch {
      setItems((prev) => prev.map((x) => (x.id === row.id ? snapshot : x)));
      alert("네트워크 오류로 담당자 변경에 실패했습니다.");
    } finally {
      setPatchingAssigneeIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  };

  const openMemo = async (row: LeadRow) => {
    const openId = row.id;
    setMemoRow(row);
    memoSavedRef.current = row.memo ?? "";
    setMemoSaveStatus("idle");
    setMemoLogs([]);
    const cat = row.type === "후보자" ? "candidates" : "consumers";
    try {
      const res = await fetch(`/api/admin/leads/${row.id}?category=${cat}`);
      const data = await res.json();
      if (!data.ok) return;
      setMemoLogs(data.memo_logs ?? []);
      if (!data.item) return;
      // 상세 로드 중에 사용자가 이미 편집(붙여넣기 등)했으면 서버 메모로 덮지 않음
      const current = memoRowRef.current;
      const dirty =
        current?.id === openId && (current.memo ?? "") !== memoSavedRef.current;
      if (dirty) {
        setMemoRow((prev) =>
          prev?.id === openId ? { ...data.item, memo: prev.memo } : prev
        );
      } else if (memoRowRef.current?.id === openId) {
        memoSavedRef.current = data.item.memo ?? "";
        setMemoRow(data.item);
      }
    } catch {
      // 목록 메모로 편집 유지
    }
  };

  useEffect(() => {
    memoRowRef.current = memoRow;
  }, [memoRow]);

  useEffect(() => {
    if (!memoRow || !isMemoEditable(memoRow.status)) return;
    if ((memoRow.memo ?? "") === memoSavedRef.current) {
      // 붙여넣기 직후 서버 응답으로 내용이 되돌아간 경우 등, saving에 고착되지 않게
      setMemoSaveStatus((s) => (s === "saving" ? "idle" : s));
      return;
    }

    const row = memoRow;
    const memo = memoRow.memo ?? "";
    setMemoSaveStatus("saving");
    const t = window.setTimeout(() => {
      void (async () => {
        // 디바운스 동안 다시 바뀌었으면 이 요청은 무시 (최신 effect가 처리)
        if (memoRowRef.current?.id !== row.id || (memoRowRef.current.memo ?? "") !== memo) {
          return;
        }
        const cat = row.type === "후보자" ? "candidates" : "consumers";
        try {
          const res = await fetch(`/api/admin/leads/${row.id}?category=${cat}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ memo }),
          });
          const data = await res.json();
          if (!data.ok) {
            if (memoRowRef.current?.id === row.id && (memoRowRef.current.memo ?? "") === memo) {
              setMemoSaveStatus("error");
            }
            return;
          }
          // 저장 성공 시점에도 최신 입력이면 saved 반영
          if (memoRowRef.current?.id === row.id && (memoRowRef.current.memo ?? "") === memo) {
            memoSavedRef.current = memo;
            setMemoSaveStatus("saved");
          } else if (memoRowRef.current?.id === row.id) {
            // 더 최신 입력이 있음 → saved ref만 이 시점 값으로 올리지 않음 (다음 저장이 이어짐)
          } else {
            memoSavedRef.current = memo;
          }
          if (data.item) {
            setItems((prev) =>
              prev.map((x) =>
                x.id === row.id
                  ? {
                      ...data.item,
                      memo:
                        memoRowRef.current?.id === row.id ? memoRowRef.current.memo : data.item.memo,
                    }
                  : x
              )
            );
          }
        } catch {
          if (memoRowRef.current?.id === row.id && (memoRowRef.current.memo ?? "") === memo) {
            setMemoSaveStatus("error");
          }
        }
      })();
    }, 700);
    return () => window.clearTimeout(t);
  }, [memoRow?.id, memoRow?.memo, memoRow?.status]);

  const closeMemo = async () => {
    const row = memoRowRef.current;
    if (row && isMemoEditable(row.status) && (row.memo ?? "") !== memoSavedRef.current) {
      setMemoSaveStatus("saving");
      await patch(row, { memo: row.memo ?? "" });
      memoSavedRef.current = row.memo ?? "";
    }
    setMemoRow(null);
    setMemoSaveStatus("idle");
  };

  const downloadExcel = () => {
    const sp = new URLSearchParams(query);
    sp.set("format", "xls");
    sp.set("limit", "5000");
    sp.set("offset", "0");
    window.location.href = `/api/admin/leads/export?${sp.toString()}`;
  };

  const salesStaff = staff.filter((s) => (s.rank ?? "sales") === "sales");
  const managers = staff.filter((s, _, arr) => arr.some((o) => o.parent_id === s.id) || s.parent_id == null);
  const isAdmin = session?.rank === "admin";
  const showAdmin = isAdmin || session?.rank === "manager";
  const canExport = showAdmin;
  const canBulkAssign = needReassign && showAdmin;
  const showHeatmapFor = (_row: LeadRow) => category === "candidates" || category === "consumers" || category === "all";

  const heatmapHref = (row: LeadRow) => {
    const cat =
      category === "candidates"
        ? "candidates"
        : category === "consumers"
          ? "consumers"
          : row.type === "후보자"
            ? "candidates"
            : "consumers";
    return `/admin/${cat}/heatmap?id=${encodeURIComponent(row.id)}`;
  };
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const allPageSelected = items.length > 0 && items.every((r) => selectedIds.has(r.id));

  const formatMemoTime = (iso: string) =>
    new Date(iso).toLocaleString("ko-KR", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  const toggleSelect = (row: LeadRow) => {
    setSelectedIds((prev) => {
      const next = new Map(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.set(row.id, row.type === "후보자" ? "candidates" : "consumers");
      return next;
    });
  };

  const toggleSelectAllPage = () => {
    setSelectedIds((prev) => {
      const next = new Map(prev);
      if (allPageSelected) {
        for (const r of items) next.delete(r.id);
      } else {
        for (const r of items) next.set(r.id, r.type === "후보자" ? "candidates" : "consumers");
      }
      return next;
    });
  };

  const bulkAssign = async () => {
    if (!bulkAssigneeId || selectedIds.size === 0) {
      alert("영업자와 대상을 선택해 주세요.");
      return;
    }
    setBulkSaving(true);
    try {
      const payloadItems = Array.from(selectedIds.entries()).map(([id, cat]) => ({
        id,
        category: cat,
      }));
      const res = await fetch("/api/admin/leads/bulk-assignee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignee_id: bulkAssigneeId, items: payloadItems }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.message || "일괄 변경에 실패했습니다.");
        return;
      }
      setSelectedIds(new Map());
      setBulkAssigneeId("");
      await load();
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setBulkSaving(false);
    }
  };
  const hasFilters =
    !!search ||
    !!dateFrom ||
    !!dateTo ||
    assigneeIds.length +
      teamIds.length +
      regions.length +
      statuses.length +
      adminStatuses.length +
      jobRanks.length +
      ageGroups.length +
      jobs.length +
      entryPages.length >
      0;

  const filterGroups: FilterGroup[] = [
    {
      key: "assigneeIds",
      label: "담당자",
      options: staff.map((s) => ({ value: s.id, label: s.name })),
      selected: assigneeIds,
    },
    ...(showAdmin
      ? [
          {
            key: "teamIds",
            label: "팀",
            options: managers.map((s) => ({ value: s.id, label: s.name })),
            selected: teamIds,
          },
        ]
      : []),
    { key: "regions", label: "지역", options: options.regions.map((v) => ({ value: v, label: v })), selected: regions },
    {
      key: "statuses",
      label: "상담상태",
      options: ["배정전", "대기", "1차컨택", "부재(메신저완료)", "상담완료", "대면확정", "가입완료"].map((v) => ({
        value: v,
        label: v,
      })),
      selected: statuses,
    },
    ...(showAdmin
      ? [
          {
            key: "adminStatuses",
            label: "관리자상태",
            options: ADMIN_STATUS_FILTER_OPTIONS,
            selected: adminStatuses,
          },
        ]
      : []),
    { key: "jobRanks", label: "직급", options: options.job_ranks.map((v) => ({ value: v, label: v })), selected: jobRanks },
    { key: "ageGroups", label: "연령대", options: options.age_groups.map((v) => ({ value: v, label: v })), selected: ageGroups },
    { key: "jobs", label: "직업", options: options.jobs.map((v) => ({ value: v, label: v })), selected: jobs },
    {
      key: "entryPages",
      label: "유입페이지",
      options: options.entry_pages.map((v) => ({ value: v, label: v })),
      selected: entryPages,
    },
  ];

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (dateFrom || dateTo) {
    chips.push({
      key: "date",
      label: `기간 ${dateFrom ? formatYmdDot(dateFrom) : "…"}–${dateTo ? formatYmdDot(dateTo) : "…"}`,
      onRemove: () => {
        setDateFrom("");
        setDateTo("");
        setPage(0);
      },
    });
  }
  for (const id of assigneeIds) {
    chips.push({
      key: `a-${id}`,
      label: `담당자: ${staff.find((s) => s.id === id)?.name ?? id}`,
      onRemove: () => {
        setAssigneeIds((prev) => prev.filter((x) => x !== id));
        setPage(0);
      },
    });
  }
  for (const id of teamIds) {
    chips.push({
      key: `t-${id}`,
      label: `팀: ${staff.find((s) => s.id === id)?.name ?? id}`,
      onRemove: () => {
        setTeamIds((prev) => prev.filter((x) => x !== id));
        setPage(0);
      },
    });
  }
  for (const v of regions) {
    chips.push({
      key: `r-${v}`,
      label: `지역: ${v}`,
      onRemove: () => {
        setRegions((prev) => prev.filter((x) => x !== v));
        setPage(0);
      },
    });
  }
  for (const v of statuses) {
    chips.push({
      key: `s-${v}`,
      label: `상태: ${v}`,
      onRemove: () => {
        setStatuses((prev) => prev.filter((x) => x !== v));
        setPage(0);
      },
    });
  }
  for (const v of adminStatuses) {
    chips.push({
      key: `as-${v}`,
      label: `관리자: ${ADMIN_STATUS_FILTER_OPTIONS.find((o) => o.value === v)?.label ?? v}`,
      onRemove: () => {
        setAdminStatuses((prev) => prev.filter((x) => x !== v));
        setPage(0);
      },
    });
  }
  for (const v of jobRanks) {
    chips.push({
      key: `jr-${v}`,
      label: `직급: ${v}`,
      onRemove: () => {
        setJobRanks((prev) => prev.filter((x) => x !== v));
        setPage(0);
      },
    });
  }
  for (const v of ageGroups) {
    chips.push({
      key: `ag-${v}`,
      label: `연령대: ${v}`,
      onRemove: () => {
        setAgeGroups((prev) => prev.filter((x) => x !== v));
        setPage(0);
      },
    });
  }
  for (const v of jobs) {
    chips.push({
      key: `j-${v}`,
      label: `직업: ${v}`,
      onRemove: () => {
        setJobs((prev) => prev.filter((x) => x !== v));
        setPage(0);
      },
    });
  }
  for (const v of entryPages) {
    chips.push({
      key: `e-${v}`,
      label: `유입: ${v}`,
      onRemove: () => {
        setEntryPages((prev) => prev.filter((x) => x !== v));
        setPage(0);
      },
    });
  }

  const applyFilters = (next: Record<string, string[]>) => {
    setAssigneeIds(next.assigneeIds ?? []);
    setTeamIds(next.teamIds ?? []);
    setRegions(next.regions ?? []);
    setStatuses(next.statuses ?? []);
    setAdminStatuses(next.adminStatuses ?? []);
    setJobRanks(next.jobRanks ?? []);
    setAgeGroups(next.ageGroups ?? []);
    setJobs(next.jobs ?? []);
    setEntryPages(next.entryPages ?? []);
    setPage(0);
  };

  const resetFilters = () => {
    setAssigneeIds([]);
    setTeamIds([]);
    setRegions([]);
    setStatuses([]);
    setAdminStatuses([]);
    setJobRanks([]);
    setAgeGroups([]);
    setJobs([]);
    setEntryPages([]);
    setPage(0);
  };

  return (
    <div>
      {(title || description) && (
        <div>
          {title && <h1 className="crm-page-title">{title}</h1>}
          {description && <p className="crm-page-desc">{description}</p>}
        </div>
      )}

      <div className="crm-toolbar">
        <div className="crm-search">
          <span className="crm-search-icon" aria-hidden>
            ⌕
          </span>
          <input
            className="crm-input"
            placeholder="이름 또는 연락처 검색"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(0);
            }}
            aria-label="이름 또는 연락처 검색"
          />
        </div>
        <div className="crm-toolbar-actions">
          <DateRangePicker
            from={dateFrom}
            to={dateTo}
            onChange={(f, t) => {
              setDateFrom(f);
              setDateTo(t);
              setPage(0);
            }}
          />
          <FilterPopover groups={filterGroups} onApply={applyFilters} onReset={resetFilters} />
        </div>
      </div>

      {chips.length > 0 && (
        <div className="crm-chip-row" aria-label="적용된 필터">
          {chips.map((c) => (
            <span key={c.key} className="crm-chip">
              {c.label}
              <button type="button" aria-label={`${c.label} 제거`} onClick={c.onRemove}>
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            className="crm-btn crm-btn-ghost"
            style={{ height: 28 }}
            onClick={() => {
              setSearchInput("");
              setDateFrom("");
              setDateTo("");
              resetFilters();
            }}
          >
            전체 초기화
          </button>
        </div>
      )}

      <div className="crm-meta-row">
        <span>
          {loading ? "불러오는 중…" : `결과 ${total.toLocaleString()}건`}
          {hasFilters && !loading ? " · 필터 적용됨" : ""}
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {canBulkAssign && selectedIds.size > 0 && (
            <div className="crm-bulk-bar">
              <span>{selectedIds.size}건 선택</span>
              <select
                className="crm-select"
                value={bulkAssigneeId}
                onChange={(e) => setBulkAssigneeId(e.target.value)}
                aria-label="일괄 담당자"
              >
                <option value="">영업자 선택</option>
                {salesStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="crm-btn crm-btn-primary"
                disabled={bulkSaving || !bulkAssigneeId}
                onClick={() => void bulkAssign()}
              >
                {bulkSaving ? "변경 중…" : "담당자 일괄 변경"}
              </button>
            </div>
          )}
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
            표시
            <select
              className="crm-select"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
              aria-label="페이지당 표시 개수"
            >
              {[20, 30, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}개
                </option>
              ))}
            </select>
          </label>
          {canExport && (
            <button type="button" className="crm-btn crm-btn-primary" onClick={downloadExcel}>
              내보내기
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div className="crm-empty" role="alert">
          <strong>오류가 발생했습니다</strong>
          {error}
          <div style={{ marginTop: 12 }}>
            <button type="button" className="crm-btn crm-btn-primary" onClick={() => void load()}>
              다시 시도
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="crm-table-shell" style={{ padding: 16 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="crm-skeleton" style={{ height: 40, marginBottom: 8 }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="crm-empty">
          <strong>{hasFilters ? "검색 결과가 없습니다" : "데이터가 없습니다"}</strong>
          {hasFilters
            ? "조건을 바꾸거나 필터를 초기화해 보세요."
            : "상담 신청이 들어오면 이곳에 표시됩니다."}
        </div>
      ) : (
        <>
          <div className="crm-table-shell crm-table-desktop">
            <table className="crm-table">
              <thead>
                <tr>
                  {canBulkAssign && (
                    <th style={{ width: 40 }}>
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={toggleSelectAllPage}
                        aria-label="현재 페이지 전체 선택"
                      />
                    </th>
                  )}
                  <th>광고소재</th>
                  <th>랜딩페이지</th>
                  <th>고객</th>
                  <th>신청시간</th>
                  <th>유입페이지</th>
                  <th>지역</th>
                  <th>상담가능시간</th>
                  <th>연령대</th>
                  <th>직업</th>
                  <th>직급</th>
                  <th>유입경로</th>
                  <th>담당자</th>
                  <th>배정일</th>
                  {showAdmin && <th>관리자상태</th>}
                  <th>상담상태</th>
                  <th>메모</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const allowed = session ? allowedStatusesFor(session as SessionUser, row.status) : [row.status];
                  return (
                    <tr
                      key={row.id}
                      className={selectedId === row.id ? "is-selected" : undefined}
                      style={{ background: rowBackground(row.status, row.admin_status?.key) }}
                      onClick={() => setSelectedId(row.id)}
                    >
                      {canBulkAssign && (
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.id)}
                            onChange={() => toggleSelect(row)}
                            aria-label={`${row.name} 선택`}
                          />
                        </td>
                      )}
                      <td onClick={(e) => e.stopPropagation()}>
                        {row.meta_creative_preview ? (
                          <button
                            type="button"
                            className="crm-meta-creative"
                            title={
                              [row.meta_ad_name, row.meta_ad_id, row.meta_creative_type]
                                .filter(Boolean)
                                .join(" · ") || "Meta 광고 소재"
                            }
                            onClick={() =>
                              setPreviewSrc(row.meta_creative_full || row.meta_creative_preview)
                            }
                          >
                            <img
                              className="crm-thumb crm-thumb-meta"
                              src={row.meta_creative_preview}
                              alt={row.meta_ad_name || "광고 소재"}
                            />
                            {row.meta_creative_type === "video" && (
                              <span className="crm-meta-creative-badge">영상</span>
                            )}
                          </button>
                        ) : row.meta_ad_id ? (
                          <span
                            className="crm-cell-plain"
                            style={{ fontSize: 11, color: "var(--crm-muted)" }}
                            title={
                              row.meta_creative_status === "missing_token"
                                ? "META_ACCESS_TOKEN 미설정"
                                : row.meta_ad_name || row.meta_ad_id
                            }
                          >
                            {row.meta_ad_name
                              ? row.meta_ad_name.slice(0, 18)
                              : `ID ${row.meta_ad_id.slice(-6)}`}
                          </span>
                        ) : (
                          <span className="crm-cell-plain" style={{ color: "var(--crm-muted)" }}>
                            -
                          </span>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {showHeatmapFor(row) ? (
                          <Link
                            href={heatmapHref(row)}
                            className="crm-btn"
                            style={{ fontSize: 12 }}
                            title="이 고객의 랜딩 스크롤 히트맵"
                          >
                            랜딩페이지
                          </Link>
                        ) : (
                          <span className="crm-cell-plain" style={{ color: "var(--crm-muted)" }}>
                            -
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="crm-customer">
                          <span className="crm-customer-name">{row.name}</span>
                          <span className="crm-customer-phone">{formatPhoneKorean(row.phone)}</span>
                        </div>
                      </td>
                      <td className="crm-cell-plain" style={{ color: "var(--crm-muted)", fontSize: 12 }}>{row.created_at}</td>
                      <td className="crm-cell-plain">{row.entry_page || "-"}</td>
                      <td className="crm-cell-plain">{row.region || "-"}</td>
                      <td className="crm-cell-plain">{row.available_time || "-"}</td>
                      <td className="crm-cell-plain">{row.age_group || "-"}</td>
                      <td className="crm-cell-plain">{row.job || "-"}</td>
                      <td className="crm-cell-plain">{row.job_rank || "-"}</td>
                      <td className="crm-cell-plain" title={`${row.utm_source}/${row.utm_medium}/${row.utm_campaign}`}>{row.utm_source || "-"}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {showAdmin ? (
                          <AssigneePicker
                            value={row.assignee_id}
                            staff={staff}
                            teamName={row.team_name}
                            history={isAdmin ? row.assignee_history : undefined}
                            busy={patchingAssigneeIds.has(row.id)}
                            onChange={(id) => void patchAssignee(row, id)}
                          />
                        ) : (
                          <div>
                            <div>{formatAssigneeWithTeam(row.assignee_name, row.team_name)}</div>
                          </div>
                        )}
                      </td>
                      <td
                        className="crm-cell-plain"
                        style={{ color: "var(--crm-muted)", fontSize: 12, whiteSpace: "nowrap" }}
                        title={row.assignee_id ? "현재 담당자 배정 시각" : undefined}
                      >
                        {row.assignee_id ? formatAssignedAt(row.assigned_at) : "-"}
                      </td>
                      {showAdmin && (
                        <td className="crm-cell-admin-status">
                          {row.admin_status ? <span className="admin-tag">{row.admin_status.label}</span> : "-"}
                        </td>
                      )}
                      <td className="crm-cell-status" onClick={(e) => e.stopPropagation()}>
                        <StatusBadgeMenu
                          value={row.status}
                          options={allowed}
                          onChange={(status) => void patch(row, { status })}
                        />
                        {row.status === "대면확정" && (
                          <input
                            className="crm-input"
                            type="datetime-local"
                            step={3600}
                            value={toKstHourLocalInput(row.meeting_at)}
                            onChange={(e) =>
                              void patch(row, { meeting_at: fromKstHourLocalInput(e.target.value) })
                            }
                            style={{ display: "block", marginTop: 6, height: 32, fontSize: 12, minWidth: 180 }}
                          />
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()} style={{ minWidth: 280, width: "28%" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <div
                            className="crm-memo-preview"
                            role="button"
                            tabIndex={0}
                            onClick={() => void openMemo(row)}
                            onDoubleClick={() => void openMemo(row)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") void openMemo(row);
                            }}
                            title={isMemoEditable(row.status) ? "클릭하여 메모 편집" : "배정전·대기 상태에서는 메모를 편집할 수 없습니다"}
                            style={{ flex: 1 }}
                          >
                            {row.memo?.trim() || "메모 없음"}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {isMobile && (
            <div className="crm-lead-list-shell">
              <table className="crm-lead-mobile-table">
                <thead>
                  <tr>
                    {canBulkAssign && (
                      <th className="crm-lead-mobile-check">
                        <input
                          type="checkbox"
                          checked={allPageSelected}
                          onChange={toggleSelectAllPage}
                          aria-label="현재 페이지 전체 선택"
                        />
                      </th>
                    )}
                    <th>이름</th>
                    <th>연락처</th>
                    <th>날짜</th>
                    <th>담당자</th>
                    <th>배정일</th>
                    {showAdmin && <th>관리자상태</th>}
                    <th>상담상태</th>
                    <th>메모</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => {
                    const allowed = session ? allowedStatusesFor(session as SessionUser, row.status) : [row.status];
                    return (
                      <tr
                        key={row.id}
                        className={selectedId === row.id ? "is-selected" : undefined}
                        style={{ background: rowBackground(row.status, row.admin_status?.key) }}
                        onClick={() => setSelectedId(row.id)}
                      >
                        {canBulkAssign && (
                          <td className="crm-lead-mobile-check" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(row.id)}
                              onChange={() => toggleSelect(row)}
                              aria-label={`${row.name} 선택`}
                            />
                          </td>
                        )}
                        <td className="crm-lead-mobile-name">{row.name}</td>
                        <td className="crm-lead-mobile-phone">{formatPhoneKorean(row.phone)}</td>
                        <td className="crm-lead-mobile-date">{row.created_at}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {showAdmin ? (
                            <AssigneePicker
                              value={row.assignee_id}
                              staff={staff}
                              teamName={row.team_name}
                              history={isAdmin ? row.assignee_history : undefined}
                              busy={patchingAssigneeIds.has(row.id)}
                              onChange={(id) => void patchAssignee(row, id)}
                            />
                          ) : (
                            <span className="crm-lead-mobile-assignee-text">
                              {formatAssigneeWithTeam(row.assignee_name, row.team_name) || "-"}
                            </span>
                          )}
                        </td>
                        <td
                          className="crm-lead-mobile-date"
                          style={{ color: "var(--crm-muted)", fontSize: 11, whiteSpace: "nowrap" }}
                          title={row.assignee_id ? "현재 담당자 배정 시각" : undefined}
                        >
                          {row.assignee_id ? formatAssignedAt(row.assigned_at) : "-"}
                        </td>
                        {showAdmin && (
                          <td onClick={(e) => e.stopPropagation()}>
                            {row.admin_status ? <span className="admin-tag">{row.admin_status.label}</span> : "-"}
                          </td>
                        )}
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="crm-lead-mobile-status-cell">
                            <StatusBadgeMenu
                              value={row.status}
                              options={allowed}
                              onChange={(status) => void patch(row, { status })}
                            />
                            {row.status === "대면확정" && (
                              <input
                                className="crm-input"
                                type="datetime-local"
                                step={3600}
                                value={toKstHourLocalInput(row.meeting_at)}
                                onChange={(e) => void patch(row, { meeting_at: fromKstHourLocalInput(e.target.value) })}
                                aria-label="대면 일정"
                              />
                            )}
                          </div>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button type="button" className="crm-btn crm-lead-mobile-memo" onClick={() => void openMemo(row)}>
                              메모
                            </button>
                            {showHeatmapFor(row) && (
                              <Link
                                href={heatmapHref(row)}
                                className="crm-btn"
                                title="이 고객의 랜딩 스크롤 히트맵"
                                onClick={(e) => e.stopPropagation()}
                              >
                                랜딩페이지
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="crm-pagination">
            <span style={{ fontSize: 13, color: "var(--crm-muted)" }}>
              {page + 1} / {pages} 페이지
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="crm-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                이전
              </button>
              <button type="button" className="crm-btn" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
                다음
              </button>
            </div>
          </div>
        </>
      )}

      {memoRow && (
        <>
          <button type="button" className="crm-drawer-backdrop" aria-label="닫기" onClick={() => void closeMemo()} />
          <aside className="crm-drawer" role="dialog" aria-label="메모 상세">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <strong style={{ fontSize: 16 }}>{memoRow.name}</strong>
                <div style={{ fontSize: 12, color: "var(--crm-muted)" }}>{formatPhoneKorean(memoRow.phone)}</div>
              </div>
              <button type="button" className="crm-btn" onClick={() => void closeMemo()}>
                닫기
              </button>
            </div>
            <textarea
              value={memoRow.memo ?? ""}
              disabled={!isMemoEditable(memoRow.status)}
              onChange={(e) => {
                const value = e.target.value;
                setMemoRow((prev) => (prev ? { ...prev, memo: value } : prev));
              }}
              aria-label="메모 내용"
            />
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--crm-muted)", minHeight: 18 }}>
              {!isMemoEditable(memoRow.status)
                ? "배정전·대기 상태에서는 메모를 편집할 수 없습니다"
                : memoSaveStatus === "saving"
                  ? "저장 중…"
                  : memoSaveStatus === "saved"
                    ? "자동 저장됨"
                    : memoSaveStatus === "error"
                      ? "저장 실패 · 다시 입력하면 재시도됩니다"
                      : "입력하면 자동 저장됩니다"}
            </div>
            {memoLogs.length > 0 && (
              <div style={{ marginTop: 12, maxHeight: 160, overflow: "auto" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--crm-muted)", marginBottom: 6 }}>이전 담당자 메모</div>
                {memoLogs.map((l) => (
                  <div key={l.id} style={{ fontSize: 12, borderTop: "1px solid var(--crm-border)", padding: "8px 0" }}>
                    <div style={{ color: "var(--crm-muted)" }}>
                      {isAdmin ? `${l.assignee_name || "미지정"} · ${formatMemoTime(l.created_at)}` : formatMemoTime(l.created_at)}
                    </div>
                    <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{l.memo || "-"}</div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </>
      )}

      {previewSrc && (
        <>
          <button type="button" className="crm-drawer-backdrop" aria-label="미리보기 닫기" onClick={() => setPreviewSrc(null)} />
          <div
            role="dialog"
            aria-label="이미지 미리보기"
            style={{
              position: "fixed",
              zIndex: 62,
              inset: 0,
              display: "grid",
              placeItems: "center",
              pointerEvents: "none",
            }}
          >
            <img src={previewSrc} alt="미리보기 확대" style={{ maxWidth: "90vw", maxHeight: "85vh", borderRadius: 8, pointerEvents: "auto" }} />
          </div>
        </>
      )}
    </div>
  );
}
