"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { DESIRED_TIME_OPTIONS, LOCATION_OPTIONS, getDesiredDateOptions } from "@/lib/formOptions";
import { useUTM } from "@/lib/useUTM";
import PrivacyConsentSection from "@/app/_components/PrivacyConsentSection";
import { useRouter } from "next/navigation";

const HERO_B2C_FALLBACK = "/assets/hero_cc.png";
const BOOK_PDF = "/assets/book.pdf";

type KarrotPixel = {
  track: (event: string, params?: Record<string, any>) => void;
};

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

export type ParentLandingPageProps = {
  hero1: string;
  hero2: string;
  /** Karrot 픽셀 `page` 파라미터 (랜딩 변형 구분) */
  karrotPage: string;
};

export default function ParentLandingPage({ hero1, hero2, karrotPage }: ParentLandingPageProps) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [desiredDate, setDesiredDate] = useState("");
  const [desiredTime, setDesiredTime] = useState("");
  const [location, setLocation] = useState("");
  const [privacyRequiredChecked, setPrivacyRequiredChecked] = useState(false);
  const [marketingChecked, setMarketingChecked] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [img1Error, setImg1Error] = useState(false);
  const [img2Error, setImg2Error] = useState(false);
  const utm = useUTM();

  const desiredDateOptions = useMemo(() => getDesiredDateOptions(), [sheetOpen]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const kp = (window as Window & { karrotPixel?: KarrotPixel }).karrotPixel;
      kp?.track("ViewContent", { page: karrotPage });
    }
  }, [karrotPage]);

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
    if (!privacyRequiredChecked) {
      showToast("개인정보제공 동의서에 동의해 주세요. (필수)", true);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: rawPhone,
          source: utm.utm_source || "daangn",
          desired_date: desiredDate || null,
          desired_time: desiredTime || null,
          location: location || null,
          utm_source: utm.utm_source || null,
          utm_medium: utm.utm_medium || null,
          utm_campaign: utm.utm_campaign || null,
          utm_content: utm.utm_content || null,
          utm_term: utm.utm_term || null,
          marketing_consent: marketingChecked ? 1 : null,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setSubmitted(true);
        setSheetOpen(false);
        if (typeof window !== "undefined") {
          sessionStorage.setItem("consultation_submitted", "1");
        }
        router.push("/complete");

        if (typeof window !== "undefined") {
          const kp = (window as Window & { karrotPixel?: KarrotPixel }).karrotPixel;
          kp?.track("Lead", { page: karrotPage });
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

  const hero1Src = img1Error ? HERO_B2C_FALLBACK : hero1;
  const hero2Src = img2Error ? HERO_B2C_FALLBACK : hero2;

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
          src={hero1Src}
          alt=""
          style={{ width: "100%", height: "auto", display: "block", verticalAlign: "bottom" }}
          onError={() => setImg1Error(true)}
        />
      </section>

      <div
        style={{
          maxWidth: 480,
          margin: "0 auto",
          padding: "24px 20px",
          background: "#fff",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <a
          href={BOOK_PDF}
          download="TY-Life-Partners-상품소개서.pdf"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            padding: "14px 22px",
            width: "100%",
            maxWidth: 400,
            boxSizing: "border-box",
            background: "#fff",
            color: "var(--cta-bg)",
            border: "2px solid var(--cta-bg)",
            borderRadius: 9999,
            fontSize: 15,
            fontWeight: 700,
            textDecoration: "none",
            WebkitTapHighlightColor: "transparent",
            boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
          }}
        >
          상품 소개서 다운로드 (PDF)
          <svg
            width={22}
            height={22}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 4v10" />
            <path d="M8 11l4 4 4-4" />
            <path d="M5 20h14" />
          </svg>
        </a>
      </div>

      <section style={{ margin: 0, lineHeight: 0, background: "#e9ecef" }}>
        <img
          src={hero2Src}
          alt=""
          style={{ width: "100%", height: "auto", display: "block", verticalAlign: "bottom" }}
          onError={() => setImg2Error(true)}
        />
      </section>

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
          {submitted ? "접수 완료" : "무료 상담 받아보기"}
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
              maxHeight: "85vh",
              margin: "0 auto",
              background: "var(--bg-card)",
              borderRadius: "16px 16px 0 0",
              boxShadow: "0 -4px 20px rgba(0,0,0,0.1)",
              zIndex: 51,
              animation: "slideUp 0.3s ease",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "24px 20px",
                paddingBottom: `calc(24px + var(--safe-bottom))`,
                overflowY: "auto",
                flex: 1,
              }}
            >
              <h2 style={{ margin: "0 0 20px", fontSize: 22, fontWeight: 600 }}>상담 신청</h2>
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 20 }}>
                  <label
                    htmlFor="lead-name"
                    style={{ display: "block", marginBottom: 8, fontSize: 18, color: "var(--text-secondary)", fontWeight: 500 }}
                  >
                    이름 (한글 2~10자)
                  </label>
                  <input
                    id="lead-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="홍길동"
                    maxLength={10}
                    disabled={loading}
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 18,
                      outline: "none",
                    }}
                  />
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label
                    htmlFor="lead-phone"
                    style={{ display: "block", marginBottom: 8, fontSize: 18, color: "var(--text-secondary)", fontWeight: 500 }}
                  >
                    연락처 (010-0000-0000)
                  </label>
                  <input
                    id="lead-phone"
                    type="tel"
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="010-1234-5678"
                    inputMode="numeric"
                    maxLength={13}
                    disabled={loading}
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 18,
                      outline: "none",
                    }}
                  />
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label
                    htmlFor="lead-desired-date"
                    style={{ display: "block", marginBottom: 8, fontSize: 18, color: "var(--text-secondary)", fontWeight: 500 }}
                  >
                    희망 상담일
                  </label>
                  <select
                    id="lead-desired-date"
                    value={desiredDate}
                    onChange={(e) => setDesiredDate(e.target.value)}
                    disabled={loading}
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 18,
                      outline: "none",
                    }}
                  >
                    {desiredDateOptions.map((o) => (
                      <option key={o.value || "empty"} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label
                    htmlFor="lead-desired-time"
                    style={{ display: "block", marginBottom: 8, fontSize: 18, color: "var(--text-secondary)", fontWeight: 500 }}
                  >
                    희망 상담시간
                  </label>
                  <select
                    id="lead-desired-time"
                    value={desiredTime}
                    onChange={(e) => setDesiredTime(e.target.value)}
                    disabled={loading}
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 18,
                      outline: "none",
                    }}
                  >
                    {DESIRED_TIME_OPTIONS.map((o) => (
                      <option key={o.value || "empty"} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label
                    htmlFor="lead-location"
                    style={{ display: "block", marginBottom: 8, fontSize: 18, color: "var(--text-secondary)", fontWeight: 500 }}
                  >
                    사는 위치
                  </label>
                  <select
                    id="lead-location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    disabled={loading}
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 18,
                      outline: "none",
                    }}
                  >
                    {LOCATION_OPTIONS.map((o) => (
                      <option key={o.value || "empty"} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <p style={{ margin: "0 0 20px", fontSize: 16, color: "var(--text-secondary)" }}>
                  제출 시 상담 안내를 위해 연락드려요.
                </p>

                <PrivacyConsentSection
                  requiredChecked={privacyRequiredChecked}
                  marketingChecked={marketingChecked}
                  onRequiredCheckedChange={setPrivacyRequiredChecked}
                  onMarketingCheckedChange={setMarketingChecked}
                />

                <button
                  type="submit"
                  disabled={loading || !privacyRequiredChecked}
                  style={{
                    width: "100%",
                    padding: "16px",
                    background: loading || !privacyRequiredChecked ? "#adb5bd" : "var(--cta-bg)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 18,
                    fontWeight: 600,
                    cursor: loading || !privacyRequiredChecked ? "default" : "pointer",
                  }}
                >
                  {loading ? "제출 중..." : "제출하기"}
                </button>
              </form>
            </div>
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
