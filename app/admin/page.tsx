"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) router.replace("/admin/dashboard");
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, password }),
      });
      const data = await res.json();
      if (data.ok) router.replace("/admin/dashboard");
      else setError(data.message || "로그인에 실패했습니다.");
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>로딩 중...</div>;
  }

  return (
    <main className="crm-admin-login">
      <h1 className="crm-admin-login-title">상담관리 로그인</h1>
      <form onSubmit={onSubmit}>
        <label htmlFor="login-id" style={{ display: "block", marginBottom: 6, fontSize: 14, color: "var(--text-secondary)" }}>
          아이디
        </label>
        <input
          id="login-id"
          value={id}
          onChange={(e) => setId(e.target.value)}
          autoComplete="username"
          style={{ width: "100%", padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 16, marginBottom: 16 }}
        />
        <label htmlFor="login-pw" style={{ display: "block", marginBottom: 6, fontSize: 14, color: "var(--text-secondary)" }}>
          비밀번호
        </label>
        <input
          id="login-pw"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          style={{ width: "100%", padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 16, marginBottom: 20 }}
        />
        {error && <p style={{ margin: "0 0 16px", fontSize: 14, color: "#e03131" }}>{error}</p>}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: 14,
            background: loading ? "#adb5bd" : "var(--cta-bg)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 600,
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </form>
    </main>
  );
}
