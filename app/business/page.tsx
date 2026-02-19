"use client";

import { useState, useCallback, useEffect } from "react";

const HERO_IMAGE = "/assets/hero_bb.jpg";
const HERO_FALLBACK = "/assets/hero_bb.jpg";

type KarrotPixel = {
  track: (event: string, params?: Record<string, unknown>) => void;
};

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

export default function BusinessLandingPage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [imgError, setImgError] = useState(false);

  // ✅ 비즈니스용 방문 분리 태깅 (예시코드 패턴)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const kp = (window as Window & { karrotPixel?: KarrotPixel }).karrotPixel;
      kp?.track("ViewContent", { page: "business" });
    }
  }, []);

  const showToast = useCallback((msg: string, error?: boolean) => {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 2500);
  }, []);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    if (raw.length <= 11) setPhone(formatPhone(raw));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitted || loading) return;

    const rawPhone = phone.replace(/\D/g, "");
    if (!name.trim()) {
      showToast("이름을 입력해주세요.", true);
      return;
    }
    if (rawPhone.length < 10 || rawPhone.length > 11) {
      showToast("연락처를 확인해주세요. (숫자 10~11자리)", true);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/business-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: rawPhone,
          source: "business",
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setSubmitted(true);
        setSheetOpen(false);
        showToast("접수 완료되었습니다.");

        // ✅ 비즈니스용 상담 전환 분리 태깅 (예시코드 패턴)
        if (typeof window !== "undefined") {
          const kp = (window as Window & { karrotPixel?: KarrotPixel }).karrotPixel;
          kp?.track("Lead", { page: "business" });
        }
      } else {
        showToast(data.message || "제출에 실패했습니다.", true);
      }
    } catch {
      showToast("네트워크 오류가 발생했습니다.", true);
    } finally {
      setLoading(false);
    }
  };

  const openSheet = () => {
    if (submitted) return;
    setSheetOpen(true);
  };

  const closeSheet = () => setSheetOpen(false);

  return (
    <main>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--bg-page)",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ width: 24, height: 24 }} aria-hidden />
        <h1
          style={{
            flex: 1,
            margin: 0,
            fontSize: 17,
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          상담 안내
        </h1>
        <div style={{ width: 24 }} aria-hidden />
      </header>

      <section style={{ margin: 0, lineHeight: 0, background: "#e9ecef" }}>
        <img
          src={imgError ? HERO_FALLBACK : HERO_IMAGE}
          alt=""
          style={{ width: "100%", height: "auto", display: "block", verticalAlign: "bottom" }}
          onError={() => setImgError(true)}
        />
      </section>

      <footer
        style={{
          padding: "10px 16px 6px",
          paddingBottom: "calc(10px + var(--safe-bottom, 0px))",
          maxWidth: 480,
          margin: "0 auto",
          fontSize: 11,
          color: "var(--text-secondary)",
          lineHeight: 1.2,
        }}
      >
        <p style={{ margin: 0 }}>사업자명: 태양라이프 파트너스</p>
        <p style={{ margin: "2px 0 0" }}>사업자등록번호: 826-24-01028</p>
        <p style={{ margin: "2px 0 0" }}>소재지 정보: 경기도 군포시 대야2로 54</p>
      </footer>

      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "12px 16px",
          paddingBottom: `calc(12px + var(--safe-bottom))`,
          background: "var(--bg-page)",
          maxWidth: 480,
          margin: "0 auto",
          boxShadow: "0 -2px 10px rgba(0,0,0,0.06)",
        }}
      >
        <button
          type="button"
          onClick={openSheet}
          disabled={submitted}
          style={{
            width: "100%",
            padding: "14px 20px",
            background: submitted ? "#adb5bd" : "var(--cta-bg)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius)",
            fontSize: 16,
            fontWeight: 600,
            cursor: submitted ? "default" : "pointer",
            transition: "background 0.2s",
          }}
          onMouseOver={(e) => {
            if (!submitted) e.currentTarget.style.background = "var(--cta-hover)";
          }}
          onMouseOut={(e) => {
            if (!submitted) e.currentTarget.style.background = "var(--cta-bg)";
          }}
        >
          {submitted ? "접수 완료" : "파트너 상담하기"}
        </button>
      </div>

      {sheetOpen && (
        <>
          <div
            role="button"
            tabIndex={0}
            aria-label="닫기"
            onClick={closeSheet}
            onKeyDown={(e) => e.key === "Escape" && closeSheet()}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.4)",
              zIndex: 50,
              animation: "fadeIn 0.2s ease",
            }}
          />
          <div
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              maxWidth: 480,
              margin: "0 auto",
              background: "var(--bg-card)",
              borderRadius: "16px 16px 0 0",
              padding: "24px 20px",
              paddingBottom: `calc(24px + var(--safe-bottom))`,
              boxShadow: "0 -4px 20px rgba(0,0,0,0.1)",
              zIndex: 51,
              animation: "slideUp 0.3s ease",
            }}
          >
            <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 600 }}>파트너 상담</h2>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label
                  htmlFor="business-lead-name"
                  style={{ display: "block", marginBottom: 6, fontSize: 14, color: "var(--text-secondary)" }}
                >
                  이름 (한글 2~10자)
                </label>
                <input
                  id="business-lead-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="홍길동"
                  maxLength={10}
                  disabled={loading}
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

              <div style={{ marginBottom: 16 }}>
                <label
                  htmlFor="business-lead-phone"
                  style={{ display: "block", marginBottom: 6, fontSize: 14, color: "var(--text-secondary)" }}
                >
                  연락처 (010-0000-0000)
                </label>
                <input
                  id="business-lead-phone"
                  type="tel"
                  value={phone}
                  onChange={handlePhoneChange}
                  placeholder="010-1234-5678"
                  inputMode="numeric"
                  maxLength={13}
                  disabled={loading}
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

              <p style={{ margin: "0 0 20px", fontSize: 12, color: "var(--text-secondary)" }}>
                제출 시 상담 안내를 위해 연락드려요.
              </p>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "14px",
                  background: loading ? "#adb5bd" : "var(--cta-bg)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: loading ? "default" : "pointer",
                }}
              >
                {loading ? "제출 중..." : "제출하기"}
              </button>
            </form>
          </div>
        </>
      )}

      {toast && (
        <div className={`toast ${toast.error ? "error" : ""} show`} role="status">
          {toast.msg}
        </div>
      )}
    </main>
  );
}