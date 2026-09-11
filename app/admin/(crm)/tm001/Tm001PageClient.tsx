"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AssigneePicker from "@/app/admin/_components/crm/AssigneePicker";
import { CrmAlert, CrmButton, CrmDialog } from "@/app/admin/_components/crm/ui";
import { fromKstMinuteLocalInput, toKstMinuteLocalInput } from "@/lib/crm/kst";
import { appendStatusMemo } from "@/lib/crm/memo";
import { canChangeTm001Assignee } from "@/lib/crm/scope";
import type { SessionUser } from "@/lib/crm/types";
import {
  TM001_PRODUCTS,
  TM001_STATUSES,
  isTm001ScheduledStatus,
  type Tm001Customer,
  type Tm001Stay,
} from "@/lib/crm/tm001/types";
import "./tm001.css";

type Staff = { id: string; name: string; parent_id: string | null };

function Icon({ d, paths }: { d?: string; paths?: string[] }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths ? paths.map((p) => <path key={p} d={p} />) : <path d={d || ""} />}
    </svg>
  );
}

function StayPanel({
  customer,
  expanded,
  onToggle,
  panelId,
  highlightRegion,
}: {
  customer: Tm001Customer;
  expanded: boolean;
  onToggle: () => void;
  panelId: string;
  highlightRegion?: string;
}) {
  const regions = Array.from(new Set(customer.stays.map((s) => s.region).filter(Boolean)));
  const needsReview = customer.stays.some((s) => s.needs_review);
  const summary =
    regions.length > 0
      ? regions.join(" · ")
      : customer.stays[0]?.hotel_name || "숙박 내역";

  return (
    <section className="stay-accordion" aria-label={`${customer.name} 고객 분류 및 숙박 내역`}>
      <button
        type="button"
        id={`stay-toggle-${panelId}`}
        className="stay-toggle"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className="stay-toggle-copy">
          <span className="stay-toggle-heading">
            <Icon
              paths={[
                "M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16M2 21h20M9 21v-5h6v5M8 7h1m6 0h1M8 11h1m6 0h1",
              ]}
            />
            <span>숙박 내역</span>
            <span className="stay-count">{customer.stays.length}건</span>
          </span>
          <span className="stay-summary-meta">
            <span className="stay-toggle-regions">{summary}</span>
            {needsReview ? (
              <span className="stay-summary-warning">
                <Icon paths={["M12 11v6m0-10h.01"]} d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0" />
                지역 확인 필요
              </span>
            ) : null}
          </span>
        </span>
        <span className="stay-toggle-action">
          <span>{expanded ? "접기" : "펼치기"}</span>
          <span className="stay-toggle-chevron">
            <Icon d="m6 9 6 6 6-6" />
          </span>
        </span>
      </button>
      <div
        className="stays-panel"
        id={panelId}
        role="region"
        hidden={!expanded}
        aria-hidden={!expanded}
      >
        <div
          className={`stays-list${customer.stays.length === 1 ? " single-stay" : ""}`}
          role="list"
        >
          {customer.stays.map((s) => (
            <StayRow key={s.id} stay={s} highlight={Boolean(highlightRegion && s.region === highlightRegion)} />
          ))}
        </div>
      </div>
    </section>
  );
}

function StayRow({ stay, highlight }: { stay: Tm001Stay; highlight?: boolean }) {
  const title = stay.hotel_name || stay.raw_room || "(숙소명 없음)";
  return (
    <div className={`stay-row${highlight ? " is-highlight" : ""}`} role="listitem">
      <div className="stay-cell stay-region">{stay.region || "-"}</div>
      <div className="stay-cell stay-detail">
        {stay.detail || "-"}
        {stay.needs_review ? (
          <span className="review-badge" title={stay.confidence || "지역 확인 필요"}>
            지역 확인 필요
          </span>
        ) : null}
      </div>
      <div className="stay-cell">
        {stay.url ? (
          <a
            className="hotel-title"
            href={stay.url}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            title="숙소 상세 · 새 탭"
          >
            {title}
            <Icon d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
          </a>
        ) : (
          <span className="hotel-title">{title}</span>
        )}
        <div className="hotel-meta">
          {stay.room ? <span title={`원본: ${stay.raw_room_type || stay.raw_room}`}>{stay.room}</span> : null}
          {stay.room && stay.stay_type ? <span aria-hidden>·</span> : null}
          {stay.stay_type ? <span>{stay.stay_type}</span> : null}
        </div>
      </div>
    </div>
  );
}

function formatAssignedAt(iso: string | null): string {
  if (!iso) return "미배정";
  try {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .format(new Date(iso))
      .replace(" ", " ");
  } catch {
    return iso;
  }
}

/** 홍조현 (고광남, 권영걸) → 본이름 + 괄호 다른 이름 */
function CustomerNameLabel({ name }: { name: string }) {
  const m = name.match(/^(.+?)\s*\((.+)\)\s*$/);
  if (!m) return <span className="customer-name">{name}</span>;
  return (
    <span className="customer-name">
      {m[1]}
      <span className="customer-name-alt"> ({m[2]})</span>
    </span>
  );
}

export default function Tm001PageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<Tm001Customer[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [session, setSession] = useState<Pick<SessionUser, "rank" | "userId" | "name"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [q, setQ] = useState(() => searchParams.get("q") || searchParams.get("search") || "");
  const [qDebounced, setQDebounced] = useState(() =>
    (searchParams.get("q") || searchParams.get("search") || "").trim()
  );
  const [region, setRegion] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [stayTotal, setStayTotal] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const [drawerSaving, setDrawerSaving] = useState(false);
  const [bulkAssigneeId, setBulkAssigneeId] = useState<string | null>(null);
  const [bulkPicked, setBulkPicked] = useState(false);
  const [memoCustomer, setMemoCustomer] = useState<Tm001Customer | null>(null);
  const [memoSaveStatus, setMemoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [commentCustomer, setCommentCustomer] = useState<Tm001Customer | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [desktopTableShellEl, setDesktopTableShellEl] = useState<HTMLDivElement | null>(null);
  const setDesktopTableShellRef = useCallback((node: HTMLDivElement | null) => {
    setDesktopTableShellEl(node);
  }, []);
  const fileRef = useRef<HTMLInputElement>(null);
  const memoCustomerRef = useRef<Tm001Customer | null>(null);
  const memoSavedRef = useRef("");
  const openIdHandledRef = useRef<string | null>(null);
  const pendingOpenIdRef = useRef<string | null>(searchParams.get("open_id"));
  const regionsRef = useRef<string[]>([]);
  regionsRef.current = regions;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2800);
  }, []);

  // PC: 표 영역을 마우스로 끌어 가로 스크롤
  useEffect(() => {
    const el = desktopTableShellEl;
    if (!el) return;

    let dragging = false;
    let moved = false;
    let startX = 0;
    let startScrollLeft = 0;

    const syncScrollableClass = () => {
      el.classList.toggle("is-scrollable-x", el.scrollWidth > el.clientWidth + 1);
    };

    const isInteractive = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      return Boolean(
        target.closest("a, button, input, select, textarea, label, .crm-popover, [contenteditable='true']")
      );
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (isInteractive(e.target)) return;
      if (el.scrollWidth <= el.clientWidth + 1) return;

      dragging = true;
      moved = false;
      startX = e.clientX;
      startScrollLeft = el.scrollLeft;
      el.classList.add("is-grab-scrolling");
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 3) moved = true;
      el.scrollLeft = startScrollLeft - dx;
      e.preventDefault();
    };

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      el.classList.remove("is-grab-scrolling");
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", endDrag);
    };

    const onClickCapture = (e: MouseEvent) => {
      if (!moved) return;
      e.preventDefault();
      e.stopPropagation();
      moved = false;
    };

    const onMouseDownCapture = (e: MouseEvent) => {
      onMouseDown(e);
      if (!dragging) return;
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", endDrag);
    };

    syncScrollableClass();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncScrollableClass) : null;
    ro?.observe(el);
    const table = el.querySelector("table");
    if (table) ro?.observe(table);

    el.addEventListener("mousedown", onMouseDownCapture);
    el.addEventListener("click", onClickCapture, true);
    window.addEventListener("resize", syncScrollableClass);
    return () => {
      ro?.disconnect();
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", endDrag);
      el.removeEventListener("mousedown", onMouseDownCapture);
      el.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("resize", syncScrollableClass);
      el.classList.remove("is-grab-scrolling", "is-scrollable-x");
    };
  }, [desktopTableShellEl, items.length, loading, pageSize]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQDebounced(q.trim());
      setPage(0);
    }, 400);
    return () => window.clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const sp = new URLSearchParams();
      if (qDebounced) sp.set("q", qDebounced);
      if (region) sp.set("region", region);
      if (status) sp.set("status", status);
      sp.set("limit", String(pageSize));
      sp.set("offset", String(page * pageSize));
      if (regionsRef.current.length > 0) sp.set("skipRegions", "1");
      const res = await fetch(`/api/admin/tm001?${sp.toString()}`);
      const data = await res.json();
      if (!data.ok) {
        setError(data.message || "목록을 불러오지 못했습니다.");
        setItems([]);
        setTotal(0);
        return;
      }
      setItems(data.items ?? []);
      setTotal(Number(data.total ?? data.items?.length ?? 0));
      if (typeof data.stayTotal === "number" && data.stayTotal >= 0) {
        setStayTotal(data.stayTotal);
      }
      if (Array.isArray(data.regions) && data.regions.length) setRegions(data.regions);
      setStaff(data.staff ?? []);
      if (data.session) setSession(data.session);
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [qDebounced, region, status, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    memoCustomerRef.current = memoCustomer;
  }, [memoCustomer]);

  const pages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const pageItems = items;

  useEffect(() => {
    if (total > 0 && page > pages - 1) setPage(Math.max(0, pages - 1));
  }, [page, pages, total]);

  const allExpanded = pageItems.length > 0 && pageItems.every((c) => expanded.has(c.id));
  const allPageSelected = pageItems.length > 0 && pageItems.every((c) => selected.has(c.id));

  const toggleStay = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllStays = () => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (allExpanded) {
        for (const c of pageItems) next.delete(c.id);
      } else {
        for (const c of pageItems) next.add(c.id);
      }
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const c of pageItems) next.delete(c.id);
      } else {
        for (const c of pageItems) next.add(c.id);
      }
      return next;
    });
  };

  const patchCustomer = async (id: string, body: Record<string, unknown>) => {
    const prev = items.find((c) => c.id === id);
    if (!prev) return false;

    const isMemoOnly =
      body.memo !== undefined &&
      body.status === undefined &&
      body.product === undefined &&
      body.meeting_at === undefined &&
      body.assignee_id === undefined &&
      body.comment_append === undefined;

    const nextStatus =
      typeof body.status === "string" ? body.status : prev.status;
    const meetingFromBody =
      body.meeting_at !== undefined
        ? body.meeting_at
          ? String(body.meeting_at)
          : null
        : undefined;

    // 낙관적 반영 — 서버는 해당 1건만 갱신
    const optimistic: Tm001Customer = {
      ...prev,
      ...(typeof body.status === "string"
        ? {
            status: body.status as Tm001Customer["status"],
            product: body.status === "계약완료" ? (body.product != null ? String(body.product) : prev.product) : null,
            ...(body.status !== prev.status
              ? { memo: appendStatusMemo(prev.memo, body.status) }
              : {}),
          }
        : {}),
      ...(body.product !== undefined && body.status === undefined
        ? { product: body.product ? String(body.product) : null }
        : {}),
      ...(meetingFromBody !== undefined
        ? { meeting_at: meetingFromBody }
        : !isTm001ScheduledStatus(nextStatus)
          ? { meeting_at: null }
          : {}),
      ...(body.memo !== undefined && body.status === undefined ? { memo: String(body.memo ?? "") } : {}),
      ...(body.assignee_id !== undefined
        ? {
            assignee_id: body.assignee_id ? String(body.assignee_id) : null,
            assignee_name: body.assignee_id
              ? staff.find((s) => s.id === body.assignee_id)?.name ?? prev.assignee_name
              : null,
            assigned_at: body.assignee_id ? new Date().toISOString() : null,
            assignee_history: (() => {
              const nextName = body.assignee_id
                ? staff.find((s) => s.id === body.assignee_id)?.name
                : null;
              if (!nextName) return prev.assignee_history;
              const base = prev.assignee_history?.length
                ? [...prev.assignee_history]
                : prev.assignee_name
                  ? [prev.assignee_name]
                  : [];
              if (!base.length || base[base.length - 1] !== nextName) base.push(nextName);
              return base;
            })(),
          }
        : {}),
    };
    setItems((list) => list.map((c) => (c.id === id ? optimistic : c)));
    if (!isMemoOnly) setSavingIds((s) => new Set(s).add(id));

    try {
      const res = await fetch(`/api/admin/tm001/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) {
        setItems((list) => list.map((c) => (c.id === id ? prev : c)));
        if (!isMemoOnly) showToast(data.message || "저장 실패");
        return false;
      }
      setItems((list) =>
        list.map((c) => {
          if (c.id !== id) return c;
          const merged = { ...data.item, stays: c.stays };
          // 메모 편집 중이면 서버 응답으로 입력값 덮지 않음
          if (memoCustomerRef.current?.id === id && isMemoOnly) {
            return { ...merged, memo: memoCustomerRef.current.memo };
          }
          return merged;
        })
      );
      if (memoCustomerRef.current?.id === id && !isMemoOnly) {
        setMemoCustomer({
          ...data.item,
          stays: memoCustomerRef.current.stays,
          memo: memoCustomerRef.current.memo,
        });
      }
      if (commentCustomer?.id === id) setCommentCustomer({ ...data.item, stays: commentCustomer.stays });
      return true;
    } catch {
      setItems((list) => list.map((c) => (c.id === id ? prev : c)));
      if (!isMemoOnly) showToast("네트워크 오류");
      return false;
    } finally {
      if (!isMemoOnly) {
        setSavingIds((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
      }
    }
  };

  // 메모 자동 저장 (후보자 DB와 동일 — 디바운스)
  useEffect(() => {
    if (!memoCustomer) return;
    const memo = memoCustomer.memo ?? "";
    if (memo === memoSavedRef.current) {
      setMemoSaveStatus((s) => (s === "saving" ? "idle" : s));
      return;
    }
    const rowId = memoCustomer.id;
    setMemoSaveStatus("saving");
    const t = window.setTimeout(() => {
      void (async () => {
        if (memoCustomerRef.current?.id !== rowId || (memoCustomerRef.current.memo ?? "") !== memo) {
          return;
        }
        const ok = await patchCustomer(rowId, { memo });
        if (memoCustomerRef.current?.id !== rowId || (memoCustomerRef.current.memo ?? "") !== memo) {
          return;
        }
        if (!ok) {
          setMemoSaveStatus("error");
          return;
        }
        memoSavedRef.current = memo;
        setMemoSaveStatus("saved");
      })();
    }, 700);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoCustomer?.id, memoCustomer?.memo]);

  const openMemo = (c: Tm001Customer) => {
    setMemoCustomer(c);
    memoSavedRef.current = c.memo ?? "";
    setMemoSaveStatus("idle");
  };

  useEffect(() => {
    const openId = pendingOpenIdRef.current ?? searchParams.get("open_id");
    if (!openId || openIdHandledRef.current === openId || loading) return;

    void (async () => {
      try {
        const res = await fetch(`/api/admin/tm001/${encodeURIComponent(openId)}`);
        const data = await res.json();
        if (!data.ok || !data.item) {
          openIdHandledRef.current = openId;
          pendingOpenIdRef.current = null;
          showToast(data.message || "고객을 찾을 수 없습니다.");
          return;
        }
        openIdHandledRef.current = openId;
        pendingOpenIdRef.current = null;
        const item = data.item as Tm001Customer;
        const phone = String(item.phone || "").trim();
        if (phone) {
          setQ(phone);
          setQDebounced(phone);
          setPage(0);
        }
        setRegion("");
        setStatus("");
        setItems((list) => {
          if (list.some((c) => c.id === item.id)) {
            return list.map((c) => (c.id === item.id ? { ...item, stays: c.stays.length ? c.stays : item.stays } : c));
          }
          return [item, ...list];
        });
        setSelected(new Set([item.id]));
        openMemo(item);

        window.setTimeout(() => {
          document
            .querySelector(`[data-tm001-id="${CSS.escape(item.id)}"]`)
            ?.scrollIntoView({ block: "center", behavior: "smooth" });
        }, 120);

        const sp = new URLSearchParams(window.location.search);
        if (sp.has("open_id")) {
          sp.delete("open_id");
          if (phone && !sp.get("search") && !sp.get("q")) sp.set("q", phone);
          const qs = sp.toString();
          router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        }
      } catch {
        openIdHandledRef.current = openId;
        pendingOpenIdRef.current = null;
        showToast("고객을 불러오지 못했습니다.");
      }
    })();
  }, [loading, searchParams, pathname, router, showToast]);

  const closeMemo = async () => {
    const row = memoCustomerRef.current;
    if (row && (row.memo ?? "") !== memoSavedRef.current) {
      await patchCustomer(row.id, { memo: row.memo ?? "" });
      memoSavedRef.current = row.memo ?? "";
    }
    setMemoCustomer(null);
    setMemoSaveStatus("idle");
  };

  const confirmBulkDelete = async () => {
    if (session?.rank !== "admin" || selected.size === 0) {
      setDeleteConfirmOpen(false);
      return;
    }
    setDeleteSaving(true);
    try {
      const ids = Array.from(selected);
      const res = await fetch("/api/admin/tm001/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!data.ok) {
        showToast(data.message || "삭제 실패");
        return;
      }
      const removed = new Set(ids);
      setItems((prev) => prev.filter((c) => !removed.has(c.id)));
      setSelected(new Set());
      setDeleteConfirmOpen(false);
      showToast(data.message || `${data.deleted ?? ids.length}건을 삭제했습니다.`);
    } catch {
      showToast("네트워크 오류");
    } finally {
      setDeleteSaving(false);
    }
  };

  const onUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/admin/tm001/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.ok) {
        showToast(data.message || "업로드 실패");
        return;
      }
      const dup =
        data.cross_batch_duplicates > 0 ? ` · 차수간 중복 ${data.cross_batch_duplicates}명` : "";
      showToast(
        `반영 완료 · 차수 ${data.batch_code} · 신규 ${data.customers_created} · 갱신 ${data.customers_updated} · 숙박 ${data.stays_inserted}건${dup}`
      );
      await load();
    } catch {
      showToast("네트워크 오류");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onBulkAssign = async () => {
    if (!bulkPicked || selected.size === 0) {
      showToast("담당자와 대상을 선택해 주세요.");
      return;
    }
    const res = await fetch("/api/admin/tm001/bulk-assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected), assignee_id: bulkAssigneeId }),
    });
    const data = await res.json();
    if (!data.ok) {
      showToast(data.message || "일괄 배정 실패");
      return;
    }
    showToast(`${data.updated ?? selected.size}건 배정 반영`);
    setSelected(new Set());
    setBulkPicked(false);
    setBulkAssigneeId(null);
    await load();
  };

  const copyPhone = async (c: Tm001Customer) => {
    try {
      await navigator.clipboard.writeText(c.phone.replace(/-/g, ""));
      showToast("전화번호를 복사했습니다.");
    } catch {
      showToast("복사에 실패했습니다.");
    }
  };


  const canAssign = session ? canChangeTm001Assignee(session as SessionUser) : false;
  const canClearAssignee = session?.rank === "admin" || session?.rank === "tm_admin";
  const canUpload = session?.rank === "admin";
  const canDelete = session?.rank === "admin";
  const showAssigneeHistory = session?.rank === "admin" || session?.rank === "tm_admin";
  const showBulkBar = selected.size > 0 && (canAssign || canDelete);

  return (
    <div>
      {toast ? (
        <div className="crm-lead-toast" role="status">
          <CrmAlert tone="success">{toast}</CrmAlert>
        </div>
      ) : null}

      <div className="crm-page-head">
        <div className="crm-page-head__text">
          <h1 className="crm-page-title">TM001</h1>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canUpload ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onUpload(f);
                }}
              />
              <button type="button" className="crm-btn crm-btn-primary" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? "업로드 중…" : "엑셀 업로드"}
              </button>
            </>
          ) : null}
          <button type="button" className="crm-btn" onClick={() => void load()} disabled={loading}>
            새로고침
          </button>
        </div>
      </div>

      <div className="crm-toolbar">
        <div className="crm-search">
          <span className="crm-search-icon" aria-hidden>
            ⌕
          </span>
          <input
            className="crm-input"
            placeholder="고객명, 연락처, 숙소명 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="검색"
          />
        </div>
        <div className="crm-toolbar-actions">
          <select
            className="crm-select"
            value={region}
            onChange={(e) => {
              setRegion(e.target.value);
              setPage(0);
            }}
            aria-label="숙박 지역"
          >
            <option value="">숙박 지역 전체</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            className="crm-select"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
            aria-label="상담상태"
          >
            <option value="">상담상태 전체</option>
            {TM001_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="crm-btn crm-btn-ghost"
            onClick={() => {
              setQ("");
              setRegion("");
              setStatus("");
              setPage(0);
            }}
          >
            필터 초기화
          </button>
        </div>
      </div>

      <div className="crm-meta-row">
        <span>
          {loading ? "불러오는 중…" : `결과 ${total.toLocaleString()}건 · 숙박 ${stayTotal.toLocaleString()}건`}
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {showBulkBar ? (
            <div className="crm-bulk-bar">
              <span>{selected.size}건 선택</span>
              {canAssign ? (
                <>
                  <AssigneePicker
                    value={bulkPicked ? bulkAssigneeId : null}
                    staff={staff}
                    placeholder={bulkPicked && bulkAssigneeId == null ? "미배정" : "담당자 선택"}
                    clearLabel="미배정"
                    clearIsSelected={bulkPicked && bulkAssigneeId == null}
                    allowClear={canClearAssignee}
                    onChange={(id) => {
                      setBulkPicked(true);
                      setBulkAssigneeId(id);
                    }}
                  />
                  <button
                    type="button"
                    className="crm-btn crm-btn-primary"
                    disabled={!bulkPicked}
                    onClick={() => void onBulkAssign()}
                  >
                    담당자 일괄 변경
                  </button>
                </>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  className="crm-btn"
                  disabled={deleteSaving}
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  {deleteSaving ? "삭제 중…" : "삭제"}
                </button>
              ) : null}
            </div>
          ) : null}
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
              {[20, 30, 50, 100, 500, 1000].map((n) => (
                <option key={n} value={n}>
                  {n}개
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="crm-btn" onClick={toggleAllStays}>
            {allExpanded ? "숙박 모두 접기" : "숙박 모두 펼치기"}
          </button>
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
      ) : null}

      {!error && region ? (
        <p style={{ fontSize: 13, color: "var(--crm-muted)", margin: "0 0 10px" }}>
          선택한 지역의 숙박 내역이 있는 고객입니다. 숙박 내역을 펼치면 해당 지역이 강조됩니다.
        </p>
      ) : null}

      {!error && (
        <div className="tm001-root">
          {loading && items.length === 0 ? (
            <div className="crm-empty">로딩 중…</div>
          ) : total === 0 && !loading ? (
            <div className="crm-empty">
              <strong>등록된 고객이 없습니다</strong>
              상단에서 핫DB 엑셀을 업로드해 주세요.
            </div>
          ) : (
            <>
              <div
                className="crm-table-shell crm-table-desktop table-scroll"
                role="region"
                aria-label="TM001 고객 DB"
                ref={setDesktopTableShellRef}
              >
                <table className="tm001-table">
                  <colgroup>
                    <col style={{ width: 39 }} />
                    <col style={{ width: 131 }} />
                    <col style={{ width: 70 }} />
                    <col className="customer-col" style={{ width: 158 }} />
                    <col style={{ width: 65 }} />
                    <col style={{ width: 118 }} />
                    <col className="hotel-col" style={{ width: 202 }} />
                    <col style={{ width: 127 }} />
                    <col style={{ width: 103 }} />
                    <col style={{ width: 139 }} />
                    <col className="status-col" style={{ width: 188 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 160 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th rowSpan={2} className="check-cell pin-check">
                        <input
                          type="checkbox"
                          checked={allPageSelected}
                          onChange={toggleSelectAll}
                          aria-label="현재 페이지 전체 선택"
                        />
                      </th>
                      <th rowSpan={2} scope="col" className="pin-partner">
                        제휴사
                      </th>
                      <th rowSpan={2} scope="col" className="pin-batch">
                        DB 차수
                      </th>
                      <th rowSpan={2} scope="col" className="pin-customer">
                        고객
                      </th>
                      <th colSpan={3} scope="colgroup" className="group-head stays-group-head">
                        <button type="button" className="stay-group-toggle" onClick={toggleAllStays} aria-expanded={allExpanded}>
                          <span>고객 분류 · 숙박 내역</span>
                          <span className="stay-group-control">
                            <span>{allExpanded ? "모두 접기" : "모두 펼치기"}</span>
                            <span className="stay-group-chevron">
                              <Icon d="m6 9 6 6 6-6" />
                            </span>
                          </span>
                        </button>
                      </th>
                      <th rowSpan={2} scope="col">
                        담당자
                      </th>
                      <th rowSpan={2} scope="col">
                        배정일
                      </th>
                      <th rowSpan={2} scope="col">
                        관리자상태
                      </th>
                      <th rowSpan={2} scope="col" className="status-col">
                        상담상태
                      </th>
                      <th rowSpan={2} scope="col" className="memo-col">
                        메모
                      </th>
                      <th rowSpan={2} scope="col" className="comment-col">
                        코멘트
                      </th>
                    </tr>
                    <tr className="sub-head">
                      <th scope="col">숙박 지역</th>
                      <th scope="col">세부 지역</th>
                      <th scope="col">숙소</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((c) => {
                      const unassigned = !c.assignee_id;
                      const saving = savingIds.has(c.id);
                      return (
                        <tr
                          key={c.id}
                          data-tm001-id={c.id}
                          data-row-status={c.status}
                          className={`contact-row${unassigned ? " unassigned" : ""}${saving ? " is-saving" : ""}${selected.has(c.id) ? " selected" : ""}`}
                        >
                          <td className="check-cell pin-check">
                            <input
                              type="checkbox"
                              checked={selected.has(c.id)}
                              onChange={() => toggleSelect(c.id)}
                              aria-label={`${c.name} 선택`}
                              disabled={saving}
                            />
                          </td>
                          <td className="pin-partner">
                            <strong className="partner-name">{c.partner_name}</strong>
                          </td>
                          <td className="pin-batch">
                            <span className="batch-badge">{c.batch_code}</span>
                          </td>
                          <td className="pin-customer">
                            <CustomerNameLabel name={c.name} />
                            <div className="phone-wrap">
                              <span className="phone">{c.phone}</span>
                              <button type="button" className="copy-btn" onClick={() => void copyPhone(c)} title="전화번호 복사">
                                복사
                              </button>
                            </div>
                            {c.memo?.startsWith("[중복]") ? (
                              <span className="merge-badge" style={{ color: "var(--amber)", marginTop: 6 }}>
                                다른 차수 중복
                              </span>
                            ) : null}
                          </td>
                          <td colSpan={3} className="classification">
                            <StayPanel
                              customer={c}
                              expanded={expanded.has(c.id)}
                              onToggle={() => toggleStay(c.id)}
                              panelId={`stays-table-${c.id}`}
                              highlightRegion={region || undefined}
                            />
                          </td>
                          <td>
                            <AssigneePicker
                              value={c.assignee_id}
                              staff={staff}
                              unresolvedLabel={c.assignee_name}
                              history={showAssigneeHistory ? c.assignee_history : undefined}
                              onChange={(id) => void patchCustomer(c.id, { assignee_id: id })}
                              disabled={saving || !canAssign}
                              allowClear={canClearAssignee}
                            />
                          </td>
                          <td>
                            <span className="muted-value">{formatAssignedAt(c.assigned_at)}</span>
                          </td>
                          <td>
                            <span className={`state-pill${unassigned ? " warn" : ""}`}>
                              <span className="dot" />
                              {unassigned ? "담당자 지정 필요" : "배정완료"}
                            </span>
                          </td>
                          <td className="status-col">
                            <div className={`status-cell${saving ? " is-saving" : ""}`}>
                              <select
                                className="status-select"
                                value={c.status}
                                disabled={saving}
                                aria-busy={saving}
                                aria-label={`${c.name} 상담상태`}
                                onChange={(e) =>
                                  void patchCustomer(c.id, {
                                    status: e.target.value,
                                    product: e.target.value === "계약완료" ? c.product : null,
                                  })
                                }
                              >
                                {TM001_STATUSES.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                              {isTm001ScheduledStatus(c.status) ? (
                                <input
                                  className="status-meeting"
                                  type="datetime-local"
                                  step={60}
                                  value={toKstMinuteLocalInput(c.meeting_at)}
                                  disabled={saving}
                                  onChange={(e) =>
                                    void patchCustomer(c.id, {
                                      meeting_at: fromKstMinuteLocalInput(e.target.value),
                                    })
                                  }
                                  aria-label={`${c.name} 재콜 일정`}
                                />
                              ) : null}
                              {c.status === "계약완료" ? (
                                <select
                                  className="status-select"
                                  value={c.product ?? ""}
                                  disabled={saving}
                                  onChange={(e) => void patchCustomer(c.id, { product: e.target.value || null })}
                                  aria-label={`${c.name} 계약 상품`}
                                >
                                  <option value="">상품 선택</option>
                                  {TM001_PRODUCTS.map((p) => (
                                    <option key={p} value={p}>
                                      {p}
                                    </option>
                                  ))}
                                </select>
                              ) : null}
                              {saving ? <span className="row-saving">저장 중…</span> : null}
                            </div>
                          </td>
                          <td className="memo-cell">
                            <button
                              type="button"
                              className={`note-button${c.memo?.trim() ? " has-text" : ""}`}
                              onClick={() => openMemo(c)}
                              aria-label={`${c.name} 메모 ${c.memo?.trim() ? "수정" : "작성"}`}
                            >
                              <span className="note-content">{c.memo?.trim() ? c.memo : "메모 없음"}</span>
                              <span className="note-action">{c.memo?.trim() ? "메모 수정" : "메모 작성"}</span>
                            </button>
                          </td>
                          <td className="comment-cell">
                            <button
                              type="button"
                              className={`note-button${c.comments?.length ? " has-text" : ""}`}
                              onClick={() => {
                                setCommentCustomer(c);
                                setCommentDraft("");
                              }}
                              aria-label={`${c.name} 코멘트 ${c.comments?.length ? "보기 및 추가" : "추가"}`}
                            >
                              {c.comments?.length ? (
                                <>
                                  <span className="comment-time">{formatAssignedAt(c.comments[c.comments.length - 1]?.at ?? null)}</span>
                                  <span className="note-content">{c.comments[c.comments.length - 1]?.text ?? ""}</span>
                                  {c.comments.length > 1 ? (
                                    <span className="comment-more">전체 {c.comments.length}개</span>
                                  ) : null}
                                </>
                              ) : (
                                <span className="note-content">코멘트 없음</span>
                              )}
                              <span className="note-action">코멘트 추가</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mobile-list" aria-label="모바일 고객 목록">
                {pageItems.map((c) => {
                  const saving = savingIds.has(c.id);
                  return (
                  <article
                    key={`m-${c.id}`}
                    data-tm001-id={c.id}
                    data-row-status={c.status}
                    className={`mobile-card${saving ? " is-saving" : ""}${selected.has(c.id) ? " selected" : ""}`}
                  >
                    <div className="m-head">
                      <div className="m-head-left">
                        <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} aria-label={`${c.name} 선택`} disabled={saving} />
                        <div>
                          <CustomerNameLabel name={c.name} />
                          <div className="phone-wrap">
                            <span className="phone">{c.phone}</span>
                            <button type="button" className="copy-btn" onClick={() => void copyPhone(c)}>
                              복사
                            </button>
                          </div>
                        </div>
                      </div>
                      <div>
                        <span className="batch-badge">{c.batch_code}</span>
                        <div className="m-partner">{c.partner_name}</div>
                      </div>
                    </div>
                    <StayPanel
                      customer={c}
                      expanded={expanded.has(c.id)}
                      onToggle={() => toggleStay(c.id)}
                      panelId={`stays-card-${c.id}`}
                      highlightRegion={region || undefined}
                    />
                    <div className="m-control-grid">
                      <div>
                        <span className="m-label">담당자</span>
                        <AssigneePicker
                          value={c.assignee_id}
                          staff={staff}
                          unresolvedLabel={c.assignee_name}
                          history={showAssigneeHistory ? c.assignee_history : undefined}
                          disabled={saving || !canAssign}
                          allowClear={canClearAssignee}
                          onChange={(id) => void patchCustomer(c.id, { assignee_id: id })}
                        />
                      </div>
                      <div>
                        <span className="m-label">상담상태{saving ? " · 저장 중…" : ""}</span>
                        <select
                          className="status-select"
                          value={c.status}
                          disabled={saving}
                          onChange={(e) => void patchCustomer(c.id, { status: e.target.value })}
                        >
                          {TM001_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        {isTm001ScheduledStatus(c.status) ? (
                          <input
                            className="status-meeting"
                            type="datetime-local"
                            step={60}
                            value={toKstMinuteLocalInput(c.meeting_at)}
                            disabled={saving}
                            onChange={(e) =>
                              void patchCustomer(c.id, {
                                meeting_at: fromKstMinuteLocalInput(e.target.value),
                              })
                            }
                            aria-label={`${c.name} 재콜 일정`}
                            style={{ marginTop: 6 }}
                          />
                        ) : null}
                      </div>
                    </div>
                  </article>
                  );
                })}
              </div>

              <div className="crm-pagination">
                <span style={{ fontSize: 13, color: "var(--crm-muted)" }}>
                  {page + 1} / {pages} 페이지
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="crm-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    이전
                  </button>
                  <button
                    type="button"
                    className="crm-btn"
                    disabled={page >= pages - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    다음
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {memoCustomer ? (
        <>
          <button type="button" className="crm-drawer-backdrop" aria-label="닫기" onClick={() => void closeMemo()} />
          <aside className="crm-drawer" role="dialog" aria-label="메모">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <strong style={{ fontSize: 16 }}>{memoCustomer.name}</strong>
                <div style={{ fontSize: 12, color: "var(--crm-muted)" }}>{memoCustomer.phone}</div>
              </div>
              <button type="button" className="crm-btn" onClick={() => void closeMemo()}>
                닫기
              </button>
            </div>
            <textarea
              className="crm-drawer-memo-field"
              value={memoCustomer.memo ?? ""}
              onChange={(e) => {
                const value = e.target.value;
                setMemoCustomer((prev) => (prev ? { ...prev, memo: value } : prev));
              }}
              aria-label="메모 내용"
            />
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--crm-muted)", minHeight: 18 }}>
              {memoSaveStatus === "saving"
                ? "저장 중…"
                : memoSaveStatus === "saved"
                  ? "저장됨"
                  : memoSaveStatus === "error"
                    ? "저장 실패 — 다시 입력해 주세요"
                    : "입력하면 자동 저장됩니다"}
            </div>
          </aside>
        </>
      ) : null}

      {commentCustomer ? (
        <>
          <button type="button" className="crm-drawer-backdrop" aria-label="닫기" onClick={() => setCommentCustomer(null)} />
          <aside className="crm-drawer" role="dialog" aria-label="코멘트">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <strong style={{ fontSize: 16 }}>{commentCustomer.name}</strong>
                <div style={{ fontSize: 12, color: "var(--crm-muted)" }}>{commentCustomer.phone}</div>
              </div>
              <button type="button" className="crm-btn" onClick={() => setCommentCustomer(null)}>
                닫기
              </button>
            </div>
            <div style={{ maxHeight: 220, overflow: "auto", marginBottom: 12 }}>
              {(commentCustomer.comments ?? []).length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--crm-muted)" }}>아직 코멘트가 없습니다.</div>
              ) : (
                commentCustomer.comments.map((c) => (
                  <div key={c.id} style={{ borderTop: "1px solid var(--crm-border)", padding: "8px 0", fontSize: 12 }}>
                    <div style={{ color: "var(--crm-muted)" }}>
                      {c.by || ""} · {formatAssignedAt(c.at)}
                    </div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{c.text}</div>
                  </div>
                ))
              )}
            </div>
            <textarea className="crm-input" value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} rows={4} style={{ width: "100%" }} />
            <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="crm-btn crm-btn-primary"
                disabled={!commentDraft.trim() || drawerSaving}
                onClick={() => {
                  setDrawerSaving(true);
                  void patchCustomer(commentCustomer.id, { comment_append: commentDraft }).then((ok) => {
                    setDrawerSaving(false);
                    if (ok) {
                      setCommentCustomer(null);
                      setCommentDraft("");
                    }
                  });
                }}
              >
                {drawerSaving ? "저장 중…" : "추가"}
              </button>
            </div>
          </aside>
        </>
      ) : null}

      <CrmDialog
        open={deleteConfirmOpen}
        onClose={() => {
          if (!deleteSaving) setDeleteConfirmOpen(false);
        }}
        title="삭제 확인"
        footer={
          <>
            <CrmButton variant="secondary" disabled={deleteSaving} onClick={() => setDeleteConfirmOpen(false)}>
              취소
            </CrmButton>
            <CrmButton variant="danger" disabled={deleteSaving} onClick={() => void confirmBulkDelete()}>
              {deleteSaving ? "삭제 중…" : "삭제"}
            </CrmButton>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          선택한 <strong>{selected.size}</strong>건을 삭제할까요? 숙박 내역과 배정 이력도 함께 삭제됩니다.
        </p>
      </CrmDialog>
    </div>
  );
}
