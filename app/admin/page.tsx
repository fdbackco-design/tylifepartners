"use client";

import { useState, useEffect, useCallback } from "react";
import { buildAllPlatformLinks } from "@/lib/utm";
import { formatPhoneKorean } from "@/lib/phone";

const PAGE_SIZE = 20;

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [leads, setLeads] = useState<
    {
      id: string;
      name: string;
      phone: string;
      created_at: string;
      status: string;
      memo: string;
      desired_date: string;
      desired_time: string;
      location: string;
      utm_source: string;
      utm_medium: string;
      utm_campaign: string;
      utm_content: string;
      entry_page: string;
      region: string;
      available_time: string;
      age_group: string;
      job: string;
    }[]
  >([]);
  const [searchInput, setSearchInput] = useState("");
  const [total, setTotal] = useState(0);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<{ id: string; msg: string; error?: boolean } | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [category, setCategory] = useState<"b2c" | "b2b" | "utm">("b2c");
  const [utmBaseUrl, setUtmBaseUrl] = useState("https://www.tylifepartners.com");
  const [utmPath, setUtmPath] = useState("/");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [utmContent, setUtmContent] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const debouncedSearch = useDebounce(searchInput, 400);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => {
      setIsMobile(mq.matches);
      if (!mq.matches) setNavOpen(false);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  const updateLeadLocal = useCallback(
    (id: string, updates: { status?: string; memo?: string }) => {
      setLeads((prev) =>
        prev.map((l) => (l.id === id ? { ...l, ...updates } : l))
      );
    },
    []
  );

  const handleSaveLead = useCallback(
    async (lead: { id: string; status: string; memo: string }, cat: "b2c" | "b2b") => {
      setSavingId(lead.id);
      setSaveMsg(null);
      try {
        const res = await fetch(`/api/admin/leads/${lead.id}?category=${cat}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: lead.status, memo: lead.memo }),
        });
        const data = await res.json();
        if (data.ok) {
          setSaveMsg({ id: lead.id, msg: "저장됨" });
          setTimeout(() => setSaveMsg(null), 2000);
        } else {
          setSaveMsg({ id: lead.id, msg: data.message ?? "저장 실패", error: true });
        }
      } catch {
        setSaveMsg({ id: lead.id, msg: "네트워크 오류", error: true });
      } finally {
        setSavingId(null);
      }
    },
    []
  );

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/leads?category=${category}&search=${encodeURIComponent(debouncedSearch)}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`
      );
      const data = await res.json();
      if (res.status === 401) {
        setLoggedIn(false);
        return;
      }
      if (data.ok) {
        setLeads(data.items ?? []);
        setTotal(data.total ?? data.items?.length ?? 0);
        setPendingTotal(typeof data.pending_total === "number" ? data.pending_total : 0);
      }
    } finally {
      setLoading(false);
    }
  }, [category, debouncedSearch, page]);

  // 세션 체크: leads API로 확인
  useEffect(() => {
    fetch("/api/admin/leads?limit=1")
      .then((res) => {
        if (res.status === 401) setLoggedIn(false);
        else setLoggedIn(true);
      })
      .catch(() => setLoggedIn(false));
  }, []);

  useEffect(() => {
    if (loggedIn === true && category !== "utm") fetchLeads();
  }, [loggedIn, category, debouncedSearch, page, fetchLeads]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, password }),
      });
      const data = await res.json();
      if (data.ok) {
        setLoggedIn(true);
        setPage(0);
      } else {
        setLoginError(data.message || "로그인에 실패했습니다.");
      }
    } catch {
      setLoginError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    setLogoutLoading(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      setLoggedIn(false);
      setLeads([]);
      setSearchInput("");
      setPage(0);
      setCategory("b2c");
    } finally {
      setLogoutLoading(false);
    }
  };

  const handleExportCsv = useCallback(async () => {
    if (category !== "b2c" && category !== "b2b") return;
    setExportLoading(true);
    try {
      const res = await fetch(
        `/api/admin/leads/export?category=${category}&search=${encodeURIComponent(debouncedSearch)}`
      );
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "CSV 다운로드 실패");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tylife_${category}_leads_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("CSV 다운로드에 실패했습니다.");
    } finally {
      setExportLoading(false);
    }
  }, [category, debouncedSearch]);

  if (loggedIn === null) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>
        로딩 중...
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <main style={{ maxWidth: 400, margin: "0 auto", padding: 24 }}>
        <h1 style={{ marginBottom: 24, fontSize: 20, fontWeight: 600 }}>관리자 로그인</h1>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="admin-id"
              style={{ display: "block", marginBottom: 6, fontSize: 14, color: "var(--text-secondary)" }}
            >
              아이디
            </label>
            <input
              id="admin-id"
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              autoComplete="username"
              style={{
                width: "100%",
                padding: "12px 14px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 16,
                outline: "none",
              }}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label
              htmlFor="admin-pw"
              style={{ display: "block", marginBottom: 6, fontSize: 14, color: "var(--text-secondary)" }}
            >
              비밀번호
            </label>
            <input
              id="admin-pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              style={{
                width: "100%",
                padding: "12px 14px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 16,
                outline: "none",
              }}
            />
          </div>
          {loginError && (
            <p style={{ margin: "0 0 16px", fontSize: 14, color: "#e03131" }}>{loginError}</p>
          )}
          <button
            type="submit"
            disabled={loginLoading}
            style={{
              width: "100%",
              padding: 14,
              background: loginLoading ? "#adb5bd" : "var(--cta-bg)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 600,
              cursor: loginLoading ? "default" : "pointer",
            }}
          >
            {loginLoading ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </main>
    );
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const pickCategory = (cat: "b2c" | "b2b" | "utm") => {
    setCategory(cat);
    setPage(0);
    if (isMobile) setNavOpen(false);
  };

  const pageTitle =
    category === "utm"
      ? "UTM 링크 생성"
      : category === "b2b"
        ? "파트너 신청 리드 (B2B)"
        : "상담 신청 리드 (B2C)";

  return (
    <div style={{ display: "flex", minHeight: "100vh", position: "relative" }}>
      {isMobile && navOpen && (
        <button
          type="button"
          aria-label="메뉴 닫기"
          onClick={() => setNavOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 199,
            border: "none",
            padding: 0,
            margin: 0,
            background: "rgba(0,0,0,0.45)",
            cursor: "pointer",
          }}
        />
      )}
      {/* 왼쪽 카테고리 선택 (모바일: 햄버거로 열리는 드로어) */}
      <aside
        style={{
          width: isMobile ? 264 : 180,
          flexShrink: 0,
          borderRight: isMobile ? "none" : "1px solid var(--border)",
          background: "var(--bg-card)",
          padding: "20px 0",
          ...(isMobile
            ? {
                position: "fixed",
                top: 0,
                left: 0,
                height: "100vh",
                zIndex: 200,
                transform: navOpen ? "translateX(0)" : "translateX(-100%)",
                transition: "transform 0.22s ease",
                boxShadow: navOpen ? "4px 0 20px rgba(0,0,0,0.12)" : "none",
              }
            : {}),
        }}
      >
        <h3 style={{ margin: "0 16px 16px", fontSize: 14, color: "var(--text-secondary)", fontWeight: 500 }}>
          카테고리
        </h3>
        <button
          type="button"
          onClick={() => {
            pickCategory("b2c");
          }}
          style={{
            display: "block",
            width: "100%",
            padding: "12px 20px",
            border: "none",
            borderLeft: category === "b2c" ? "3px solid var(--cta-bg)" : "3px solid transparent",
            background: category === "b2c" ? "rgba(0,0,0,0.04)" : "transparent",
            textAlign: "left",
            fontSize: 15,
            fontWeight: category === "b2c" ? 600 : 400,
            cursor: "pointer",
          }}
        >
          B2C 고객
        </button>
        <button
          type="button"
          onClick={() => {
            pickCategory("b2b");
          }}
          style={{
            display: "block",
            width: "100%",
            padding: "12px 20px",
            border: "none",
            borderLeft: category === "b2b" ? "3px solid var(--cta-bg)" : "3px solid transparent",
            background: category === "b2b" ? "rgba(0,0,0,0.04)" : "transparent",
            textAlign: "left",
            fontSize: 15,
            fontWeight: category === "b2b" ? 600 : 400,
            cursor: "pointer",
          }}
        >
          B2B 고객
        </button>
        <button
          type="button"
          onClick={() => pickCategory("utm")}
          style={{
            display: "block",
            width: "100%",
            padding: "12px 20px",
            border: "none",
            borderLeft: category === "utm" ? "3px solid var(--cta-bg)" : "3px solid transparent",
            background: category === "utm" ? "rgba(0,0,0,0.04)" : "transparent",
            textAlign: "left",
            fontSize: 15,
            fontWeight: category === "utm" ? 600 : 400,
            cursor: "pointer",
          }}
        >
          UTM 링크
        </button>
      </aside>

      <main style={{ flex: 1, maxWidth: 1400, minWidth: 0, margin: 0, padding: 16, paddingBottom: 40, width: "100%" }}>
        {isMobile ? (
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 50,
              display: "flex",
              alignItems: "center",
              gap: 10,
              margin: "-16px -16px 16px -16px",
              padding: "12px 14px",
              background: "var(--bg-page)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <button
              type="button"
              aria-label="카테고리 메뉴 열기"
              aria-expanded={navOpen}
              onClick={() => setNavOpen(true)}
              style={{
                width: 44,
                height: 44,
                flexShrink: 0,
                display: "grid",
                placeItems: "center",
                border: "1px solid var(--border)",
                borderRadius: 10,
                background: "var(--bg-card)",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              </svg>
            </button>
            <h1
              style={{
                margin: 0,
                fontSize: 17,
                fontWeight: 600,
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {pageTitle}
            </h1>
            <button
              type="button"
              onClick={handleLogout}
              disabled={logoutLoading}
              style={{
                flexShrink: 0,
                padding: "8px 10px",
                background: "#868e96",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: logoutLoading ? "default" : "pointer",
              }}
            >
              {logoutLoading ? "..." : "로그아웃"}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{pageTitle}</h1>
            <button
              type="button"
              onClick={handleLogout}
              disabled={logoutLoading}
              style={{
                padding: "8px 14px",
                background: "#868e96",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                cursor: logoutLoading ? "default" : "pointer",
              }}
            >
              {logoutLoading ? "..." : "로그아웃"}
            </button>
          </div>
        )}

      {category === "utm" ? (
        <div style={{ maxWidth: 700 }}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 500 }}>사이트 URL</label>
            <input
              type="url"
              value={utmBaseUrl}
              onChange={(e) => setUtmBaseUrl(e.target.value)}
              placeholder="https://www.tylifepartners.com"
              style={{
                width: "100%",
                padding: "10px 14px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 15,
              }}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 500 }}>경로</label>
            <select
              value={utmPath}
              onChange={(e) => setUtmPath(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 15,
              }}
            >
              <option value="/">/ (메인)</option>
              <option value="/me">/me</option>
              <option value="/business">/business</option>
              <option value="/sidejob">/sidejob</option>
            </select>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 500 }}>캠페인명 (선택)</label>
            <input
              type="text"
              value={utmCampaign}
              onChange={(e) => setUtmCampaign(e.target.value)}
              placeholder="예: 2026_상담_캠페인"
              style={{
                width: "100%",
                padding: "10px 14px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 15,
              }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
              utm_content (선택)
            </label>
            <input
              type="text"
              value={utmContent}
              onChange={(e) => setUtmContent(e.target.value)}
              placeholder="예: hero_banner, reel_01"
              style={{
                width: "100%",
                padding: "10px 14px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 15,
              }}
            />
          </div>
          <div style={{ background: "var(--bg-card)", borderRadius: 8, padding: 20, border: "1px solid var(--border)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>플랫폼별 UTM 링크</h3>
            {utmBaseUrl
              ? buildAllPlatformLinks(
                  utmBaseUrl.replace(/\/$/, ""),
                  utmPath,
                  utmCampaign || undefined,
                  utmContent || undefined
                ).map((item) => (
                  <div key={item.platform} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: "var(--text-secondary)" }}>
                      {item.label}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <input
                        type="text"
                        readOnly
                        value={item.url}
                        style={{
                          flex: 1,
                          minWidth: 200,
                          padding: "8px 12px",
                          fontSize: 13,
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          background: "#f8f9fa",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(item.url);
                        }}
                        style={{
                          padding: "8px 12px",
                          background: "var(--cta-bg)",
                          color: "#fff",
                          border: "none",
                          borderRadius: 6,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        복사
                      </button>
                    </div>
                  </div>
                ))
              : "사이트 URL을 입력해 주세요."}
          </div>
        </div>
      ) : (
        <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12 }}>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 14px" }}>
          <span>총 {total.toLocaleString()}건</span>
          <span style={{ color: "var(--cta-bg)", fontWeight: 700 }}>신규 {pendingTotal.toLocaleString()}건</span>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={exportLoading || loading}
          style={{
            padding: "10px 14px",
            background: exportLoading || loading ? "#adb5bd" : "var(--cta-bg)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            cursor: exportLoading || loading ? "default" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {category === "b2b" ? "B2B 고객 CSV 다운로드" : "B2C 고객 CSV 다운로드"}
        </button>
      </div>
      <div style={{ marginBottom: 16 }}>
        <input
          type="search"
          placeholder="이름 또는 연락처 검색"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setPage(0);
          }}
          style={{
            width: "100%",
            padding: "12px 14px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 15,
            outline: "none",
          }}
        />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>로딩 중...</div>
      ) : leads.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>
          신청 내역이 없습니다.
        </div>
      ) : (
        <>
          {isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {leads.map((row) => (
                <div
                  key={row.id}
                  style={{
                    background: "var(--bg-card)",
                    borderRadius: "var(--radius)",
                    boxShadow: "var(--shadow)",
                    border: "1px solid var(--border)",
                    padding: 14,
                    borderLeft: row.status === "대기" ? "4px solid #ffe066" : undefined,
                  }}
                >
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>신청시간</div>
                  <div style={{ fontSize: 15, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.4, wordBreak: "break-word" }}>
                    {row.created_at}
                  </div>
                  <div style={{ marginTop: 14, fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>이름</div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{row.name}</div>
                  <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>연락처</div>
                  <div style={{ fontSize: 17, marginTop: 4, letterSpacing: "-0.02em" }}>{formatPhoneKorean(row.phone)}</div>
                  <div style={{ marginTop: 14, fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>상담상태</div>
                  <select
                    value={row.status}
                    onChange={(e) => updateLeadLocal(row.id, { status: e.target.value })}
                    style={{
                      width: "100%",
                      marginTop: 6,
                      padding: "12px 12px",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 16,
                      background: "#fff",
                    }}
                  >
                    <option value="대기">대기</option>
                    <option value="상담 완료">상담 완료</option>
                  </select>
                  {category === "b2c" && (
                    <div
                      style={{
                        marginTop: 14,
                        paddingTop: 12,
                        borderTop: "1px solid var(--border)",
                        fontSize: 14,
                        color: "var(--text-secondary)",
                        lineHeight: 1.55,
                      }}
                    >
                      <div>희망 상담일: {row.desired_date || "-"}</div>
                      <div>희망 상담시간: {row.desired_time || "-"}</div>
                      <div>사는 위치: {row.location || "-"}</div>
                      <div>유입페이지: {row.entry_page || "-"}</div>
                      <div>유입경로: {row.utm_source || "-"}</div>
                    </div>
                  )}
                  {category === "b2b" && (
                    <div
                      style={{
                        marginTop: 14,
                        paddingTop: 12,
                        borderTop: "1px solid var(--border)",
                        fontSize: 14,
                        color: "var(--text-secondary)",
                        lineHeight: 1.55,
                      }}
                    >
                      <div>유입페이지: {row.entry_page || "-"}</div>
                      <div>지역: {row.region || "-"}</div>
                      <div>상담가능시간: {row.available_time || "-"}</div>
                      <div>연령대: {row.age_group || "-"}</div>
                      <div>직업: {row.job || "-"}</div>
                      <div>유입경로: {row.utm_source || "-"}</div>
                    </div>
                  )}
                  <div style={{ marginTop: 14, fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>메모</div>
                  <textarea
                    value={row.memo}
                    onChange={(e) => updateLeadLocal(row.id, { memo: e.target.value })}
                    placeholder="메모 입력..."
                    rows={3}
                    style={{
                      width: "100%",
                      marginTop: 6,
                      padding: "10px 12px",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 15,
                      resize: "vertical",
                      fontFamily: "inherit",
                      boxSizing: "border-box",
                    }}
                  />
                  <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => handleSaveLead(row, category)}
                      disabled={savingId === row.id}
                      style={{
                        padding: "10px 16px",
                        background: savingId === row.id ? "#adb5bd" : "var(--cta-bg)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: savingId === row.id ? "default" : "pointer",
                      }}
                    >
                      {savingId === row.id ? "저장중" : "저장"}
                    </button>
                    {saveMsg?.id === row.id && (
                      <span style={{ fontSize: 13, color: saveMsg.error ? "#e03131" : "#37b24d" }}>{saveMsg.msg}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                background: "var(--bg-card)",
                borderRadius: "var(--radius)",
                boxShadow: "var(--shadow)",
                overflow: "auto",
              }}
            >
              <table style={{ width: "100%", minWidth: 1200, borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "#f8f9fa", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>신청시간</th>
                    <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>이름</th>
                    <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>연락처</th>
                    {category === "b2c" && (
                      <>
                        <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>희망 상담일</th>
                        <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>희망 상담시간</th>
                        <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>사는 위치</th>
                        <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>유입페이지</th>
                        <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>유입경로</th>
                      </>
                    )}
                    {category === "b2b" && (
                      <>
                        <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>유입페이지</th>
                        <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>지역</th>
                        <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>상담가능시간</th>
                        <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>연령대</th>
                        <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>직업</th>
                        <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>유입경로</th>
                      </>
                    )}
                    <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>상담상태</th>
                    <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>메모</th>
                    <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 600 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((row) => (
                    <tr
                      key={row.id}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: row.status === "대기" ? "#fffde7" : undefined,
                      }}
                    >
                      <td style={{ padding: "12px 10px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{row.created_at}</td>
                      <td style={{ padding: "12px 10px", whiteSpace: "nowrap" }}>{row.name}</td>
                      <td style={{ padding: "12px 10px", whiteSpace: "nowrap" }}>{formatPhoneKorean(row.phone)}</td>
                      {category === "b2c" && (
                        <>
                          <td style={{ padding: "12px 10px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                            {row.desired_date || "-"}
                          </td>
                          <td style={{ padding: "12px 10px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                            {row.desired_time || "-"}
                          </td>
                          <td style={{ padding: "12px 10px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                            {row.location || "-"}
                          </td>
                          <td style={{ padding: "12px 10px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                            {row.entry_page || "-"}
                          </td>
                          <td
                            style={{ padding: "12px 10px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}
                            title={`${row.utm_source || "-"} / ${row.utm_medium || "-"}${row.utm_campaign ? ` / ${row.utm_campaign}` : ""}${row.utm_content ? ` / ${row.utm_content}` : ""}`}
                          >
                            {row.utm_source || "-"}
                          </td>
                        </>
                      )}
                      {category === "b2b" && (
                        <>
                          <td style={{ padding: "12px 10px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                            {row.entry_page || "-"}
                          </td>
                          <td style={{ padding: "12px 10px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                            {row.region || "-"}
                          </td>
                          <td style={{ padding: "12px 10px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                            {row.available_time || "-"}
                          </td>
                          <td style={{ padding: "12px 10px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                            {row.age_group || "-"}
                          </td>
                          <td style={{ padding: "12px 10px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                            {row.job || "-"}
                          </td>
                          <td
                            style={{ padding: "12px 10px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}
                            title={`${row.utm_source || "-"} / ${row.utm_medium || "-"}${row.utm_campaign ? ` / ${row.utm_campaign}` : ""}${row.utm_content ? ` / ${row.utm_content}` : ""}`}
                          >
                            {row.utm_source || "-"}
                          </td>
                        </>
                      )}
                      <td style={{ padding: "12px 10px", whiteSpace: "nowrap" }}>
                        <select
                          value={row.status}
                          onChange={(e) => updateLeadLocal(row.id, { status: e.target.value })}
                          style={{
                            padding: "6px 10px",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            fontSize: 14,
                            minWidth: 100,
                          }}
                        >
                          <option value="대기">대기</option>
                          <option value="상담 완료">상담 완료</option>
                        </select>
                      </td>
                      <td style={{ padding: "12px 10px" }}>
                        <textarea
                          value={row.memo}
                          onChange={(e) => updateLeadLocal(row.id, { memo: e.target.value })}
                          placeholder="메모 입력..."
                          rows={2}
                          style={{
                            width: "100%",
                            minWidth: 120,
                            padding: "6px 10px",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            fontSize: 14,
                            resize: "vertical",
                            fontFamily: "inherit",
                          }}
                        />
                      </td>
                      <td style={{ padding: "12px 10px", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          onClick={() => handleSaveLead(row, category)}
                          disabled={savingId === row.id}
                          style={{
                            padding: "6px 12px",
                            background: savingId === row.id ? "#adb5bd" : "var(--cta-bg)",
                            color: "#fff",
                            border: "none",
                            borderRadius: 6,
                            fontSize: 13,
                            cursor: savingId === row.id ? "default" : "pointer",
                          }}
                        >
                          {savingId === row.id ? "저장중" : "저장"}
                        </button>
                        {saveMsg?.id === row.id && (
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: 12,
                              color: saveMsg.error ? "#e03131" : "#37b24d",
                            }}
                          >
                            {saveMsg.msg}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 8,
                marginTop: 20,
              }}
            >
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                style={{
                  padding: "8px 14px",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  background: "var(--bg-card)",
                  cursor: page === 0 ? "default" : "pointer",
                  opacity: page === 0 ? 0.5 : 1,
                }}
              >
                이전
              </button>
              <span style={{ padding: "8px 14px", color: "var(--text-secondary)" }}>
                {page + 1} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                style={{
                  padding: "8px 14px",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  background: "var(--bg-card)",
                  cursor: page >= totalPages - 1 ? "default" : "pointer",
                  opacity: page >= totalPages - 1 ? 0.5 : 1,
                }}
              >
                다음
              </button>
            </div>
          )}
        </>
      )}
        </>
      )}
      </main>
    </div>
  );
}
