"use client";

import { useState, useEffect, useCallback } from "react";

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
    { id: string; name: string; phone: string; created_at: string; status: string; memo: string }[]
  >([]);
  const [searchInput, setSearchInput] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<{ id: string; msg: string; error?: boolean } | null>(null);
  const [category, setCategory] = useState<"b2c" | "b2b">("b2c");

  const debouncedSearch = useDebounce(searchInput, 400);

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
    if (loggedIn === true) fetchLeads();
  }, [loggedIn, debouncedSearch, page, fetchLeads]);

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

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* 왼쪽 카테고리 선택 */}
      <aside
        style={{
          width: 180,
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          background: "var(--bg-card)",
          padding: "20px 0",
        }}
      >
        <h3 style={{ margin: "0 16px 16px", fontSize: 14, color: "var(--text-secondary)", fontWeight: 500 }}>
          카테고리
        </h3>
        <button
          type="button"
          onClick={() => {
            setCategory("b2c");
            setPage(0);
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
            setCategory("b2b");
            setPage(0);
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
      </aside>

      <main style={{ flex: 1, maxWidth: 900, margin: 0, padding: 16, paddingBottom: 40 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
            {category === "b2b" ? "파트너 신청 리드 (B2B)" : "상담 신청 리드 (B2C)"}
          </h1>
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
          <div
            style={{
              background: "var(--bg-card)",
              borderRadius: "var(--radius)",
              boxShadow: "var(--shadow)",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f8f9fa", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 600 }}>신청시간</th>
                  <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 600 }}>이름</th>
                  <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 600 }}>연락처</th>
                  <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 600 }}>상담상태</th>
                  <th style={{ padding: "12px 10px", textAlign: "left", fontWeight: 600 }}>메모</th>
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
                    <td style={{ padding: "12px 10px", color: "var(--text-secondary)" }}>{row.created_at}</td>
                    <td style={{ padding: "12px 10px" }}>{row.name}</td>
                    <td style={{ padding: "12px 10px" }}>{row.phone}</td>
                    <td style={{ padding: "12px 10px" }}>
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
                    <td style={{ padding: "12px 10px" }}>
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
      </main>
    </div>
  );
}
