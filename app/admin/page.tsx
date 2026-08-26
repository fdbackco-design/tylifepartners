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
    return (
      <div className="crm-admin-login crm-admin-login--checking">
        <p className="crm-admin-login-checking">로딩 중...</p>
      </div>
    );
  }

  return (
    <main className="crm-admin-login">
      <div className="crm-admin-login-card">
        <p className="crm-admin-login-brand">Feed Life</p>
        <h1 className="crm-admin-login-title">상담관리 로그인</h1>
        <form className="crm-admin-login-form" onSubmit={onSubmit}>
          <label htmlFor="login-id" className="crm-admin-login-label">
            아이디
          </label>
          <input
            id="login-id"
            className="crm-admin-login-input"
            value={id}
            onChange={(e) => setId(e.target.value)}
            autoComplete="username"
            inputMode="text"
            enterKeyHint="next"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <label htmlFor="login-pw" className="crm-admin-login-label">
            비밀번호
          </label>
          <input
            id="login-pw"
            className="crm-admin-login-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            enterKeyHint="go"
          />
          {error && <p className="crm-admin-login-error">{error}</p>}
          <button type="submit" className="crm-admin-login-submit" disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </div>
    </main>
  );
}
