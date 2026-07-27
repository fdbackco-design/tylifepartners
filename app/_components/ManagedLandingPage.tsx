"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useUTM } from "@/lib/useUTM";
import PrivacyConsentSection from "@/app/_components/PrivacyConsentSection";
import LandingAnalyticsTracker from "@/app/_components/LandingAnalyticsTracker";
import { getSubmissionAnalyticsPayload } from "@/lib/landing-analytics/submissionSnapshot";
import { landingKeyForManaged } from "@/lib/managedLandings/types";
import type { ManagedCtaPosition, ManagedLandingSection } from "@/lib/managedLandings/types";
import { useRouter } from "next/navigation";

const HERO_FALLBACK = "/assets/hero_cc.png";
const BROCHURE_ICON = "/assets/icon-brochure-download.png";
const CONSULTATION_ICON = "/assets/icon-consultation-write.png";

const INSURANCE_DESIGNER_JOB = "보험설계사";
const JOB_RANK_OPTIONS = ["지점장 이상", "팀장 이상", "FC"] as const;

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

function openBrochure(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
  const link = document.createElement("a");
  link.href = url;
  link.download = "TY Life Partners 브로셔.pdf";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export type ManagedLandingPageProps = {
  id: string;
  slug: string;
  path: string;
  title: string;
  hero1Url: string;
  hero2Url: string;
  showBrochure: boolean;
  brochureUrl: string | null;
  ctaPosition: ManagedCtaPosition;
  sections?: ManagedLandingSection[];
  /** admin preview: force debug overlay host; form still works */
  previewMode?: boolean;
};

export default function ManagedLandingPage({
  id,
  slug,
  path,
  title,
  hero1Url,
  hero2Url,
  showBrochure,
  brochureUrl,
  ctaPosition,
  sections,
  previewMode: _previewMode,
}: ManagedLandingPageProps) {
  const router = useRouter();
  const hero2SectionRef = useRef<HTMLElement>(null);
  const afterBottomSentinelRef = useRef<HTMLDivElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showFixedCta, setShowFixedCta] = useState(ctaPosition === "always");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [region, setRegion] = useState("");
  const [availableTime, setAvailableTime] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [job, setJob] = useState("");
  const [jobRank, setJobRank] = useState("");
  const [privacyRequiredChecked, setPrivacyRequiredChecked] = useState(false);
  const [marketingChecked, setMarketingChecked] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [img1Error, setImg1Error] = useState(false);
  const [img2Error, setImg2Error] = useState(false);
  const utm = useUTM();

  const landingKey = landingKeyForManaged(slug);

  useEffect(() => {
    if (ctaPosition === "always") {
      setShowFixedCta(true);
      return;
    }

    if (ctaPosition === "from_bottom") {
      const el = hero2SectionRef.current;
      if (!el) return;

      const observer = new IntersectionObserver(
        ([entry]) => setShowFixedCta(entry.isIntersecting),
        { threshold: 0 }
      );
      observer.observe(el);
      return () => observer.disconnect();
    }

    if (ctaPosition === "after_bottom") {
      const el = afterBottomSentinelRef.current;
      if (!el) return;

      const observer = new IntersectionObserver(
        ([entry]) => setShowFixedCta(entry.isIntersecting),
        { threshold: 0 }
      );
      observer.observe(el);
      return () => observer.disconnect();
    }
  }, [ctaPosition]);

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
    if (!region) {
      showToast("지역을 선택해주세요.", true);
      return;
    }
    if (!availableTime) {
      showToast("상담가능시간을 선택해주세요.", true);
      return;
    }
    if (!ageGroup) {
      showToast("연령대를 선택해주세요.", true);
      return;
    }
    if (job === INSURANCE_DESIGNER_JOB && !jobRank) {
      showToast("직급을 선택해주세요.", true);
      return;
    }
    if (!privacyRequiredChecked) {
      showToast("개인정보제공 동의서에 동의해 주세요. (필수)", true);
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
          source: utm.utm_source || path.replace(/^\//, ""),
          utm_source: utm.utm_source || null,
          utm_medium: utm.utm_medium || null,
          utm_campaign: utm.utm_campaign || null,
          utm_content: utm.utm_content || null,
          utm_term: utm.utm_term || null,
          marketing_consent: marketingChecked ? 1 : null,
          region,
          available_time: availableTime,
          age_group: ageGroup,
          job: job || null,
          job_rank: job === INSURANCE_DESIGNER_JOB ? jobRank : null,
          entry_page: path,
          landing_id: id,
          landing_path: path,
          ...getSubmissionAnalyticsPayload(),
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

  const hero1Src = img1Error ? HERO_FALLBACK : hero1Url;
  const hero2Src = img2Error ? HERO_FALLBACK : hero2Url;

  return (
    <main>
      <LandingAnalyticsTracker landingKey={landingKey} sections={sections} />

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
          {title || "상담 안내"}
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

      {showBrochure && brochureUrl && (
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
          <button
            type="button"
            onClick={() => openBrochure(brochureUrl)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: "18px 32px",
              width: "100%",
              maxWidth: 400,
              boxSizing: "border-box",
              background: "#e9ecef",
              color: "#495057",
              border: "1px solid #ced4da",
              borderRadius: 9999,
              fontSize: 27,
              fontWeight: 800,
              cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
              boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 27,
                height: 27,
                flexShrink: 0,
                backgroundColor: "#495057",
                WebkitMaskImage: `url(${BROCHURE_ICON})`,
                WebkitMaskSize: "contain",
                WebkitMaskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                maskImage: `url(${BROCHURE_ICON})`,
                maskSize: "contain",
                maskRepeat: "no-repeat",
                maskPosition: "center",
              }}
            />
            상품 소개서 받아보기
          </button>
        </div>
      )}

      <section
        ref={hero2SectionRef}
        style={{
          margin: 0,
          lineHeight: 0,
          background: "#e9ecef",
          paddingBottom:
            ctaPosition === "from_bottom" && showFixedCta ? "calc(80px + var(--safe-bottom))" : 0,
        }}
      >
        <img
          src={hero2Src}
          alt=""
          style={{ width: "100%", height: "auto", display: "block", verticalAlign: "bottom" }}
          onError={() => setImg2Error(true)}
        />
      </section>

      {ctaPosition === "after_bottom" && (
        <div ref={afterBottomSentinelRef} aria-hidden style={{ height: 1 }} />
      )}

      {showFixedCta && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "10px 16px",
            paddingBottom: `calc(10px + var(--safe-bottom))`,
            background: "var(--bg-page)",
            maxWidth: 480,
            margin: "0 auto",
            boxShadow: "0 -2px 10px rgba(0,0,0,0.06)",
            zIndex: 20,
          }}
        >
          <button
            type="button"
            onClick={openSheet}
            disabled={submitted}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              width: "100%",
              padding: "15px 18px",
              background: submitted ? "#adb5bd" : "var(--cta-bg)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius)",
              fontSize: 25,
              fontWeight: 800,
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
            {!submitted && (
              <span
                aria-hidden
                style={{
                  width: 25,
                  height: 25,
                  flexShrink: 0,
                  backgroundColor: "#fff",
                  WebkitMaskImage: `url(${CONSULTATION_ICON})`,
                  WebkitMaskSize: "contain",
                  WebkitMaskRepeat: "no-repeat",
                  WebkitMaskPosition: "center",
                  maskImage: `url(${CONSULTATION_ICON})`,
                  maskSize: "contain",
                  maskRepeat: "no-repeat",
                  maskPosition: "center",
                }}
              />
            )}
            {submitted ? "접수 완료" : "상담 신청하기"}
          </button>
        </div>
      )}

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
                minHeight: 0,
                WebkitOverflowScrolling: "touch",
              }}
            >
              <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 600 }}>파트너 상담</h2>
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 16 }}>
                  <label
                    htmlFor="lead-managed-name"
                    style={{ display: "block", marginBottom: 6, fontSize: 14, color: "var(--text-secondary)" }}
                  >
                    이름 (한글 2~10자)
                  </label>
                  <input
                    id="lead-managed-name"
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
                    htmlFor="lead-managed-phone"
                    style={{ display: "block", marginBottom: 6, fontSize: 14, color: "var(--text-secondary)" }}
                  >
                    연락처 (010-0000-0000)
                  </label>
                  <input
                    id="lead-managed-phone"
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

                <div style={{ marginBottom: 16 }}>
                  <label
                    htmlFor="lead-managed-region"
                    style={{ display: "block", marginBottom: 6, fontSize: 14, color: "var(--text-secondary)" }}
                  >
                    지역 (필수)
                  </label>
                  <select
                    id="lead-managed-region"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    disabled={loading}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 16,
                      outline: "none",
                      background: "#fff",
                    }}
                  >
                    <option value="">선택하세요</option>
                    <option value="서울">서울</option>
                    <option value="경기">경기</option>
                    <option value="인천">인천</option>
                    <option value="강원">강원</option>
                    <option value="충청">충청</option>
                    <option value="경상">경상</option>
                    <option value="전라">전라</option>
                    <option value="대구">대구</option>
                    <option value="울산">울산</option>
                    <option value="제주">제주</option>
                  </select>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label
                    htmlFor="lead-managed-available-time"
                    style={{ display: "block", marginBottom: 6, fontSize: 14, color: "var(--text-secondary)" }}
                  >
                    상담가능시간 (필수)
                  </label>
                  <select
                    id="lead-managed-available-time"
                    value={availableTime}
                    onChange={(e) => setAvailableTime(e.target.value)}
                    disabled={loading}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 16,
                      outline: "none",
                      background: "#fff",
                    }}
                  >
                    <option value="">선택하세요</option>
                    <option value="오전">오전</option>
                    <option value="오후">오후</option>
                  </select>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label
                    htmlFor="lead-managed-age-group"
                    style={{ display: "block", marginBottom: 6, fontSize: 14, color: "var(--text-secondary)" }}
                  >
                    연령대 (필수)
                  </label>
                  <select
                    id="lead-managed-age-group"
                    value={ageGroup}
                    onChange={(e) => setAgeGroup(e.target.value)}
                    disabled={loading}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 16,
                      outline: "none",
                      background: "#fff",
                    }}
                  >
                    <option value="">선택하세요</option>
                    <option value="20대">20대</option>
                    <option value="30대">30대</option>
                    <option value="40대">40대</option>
                    <option value="50대">50대</option>
                    <option value="60대 이상">60대 이상</option>
                  </select>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label
                    htmlFor="lead-managed-job"
                    style={{ display: "block", marginBottom: 6, fontSize: 14, color: "var(--text-secondary)" }}
                  >
                    직업 (선택)
                  </label>
                  <select
                    id="lead-managed-job"
                    value={job}
                    onChange={(e) => {
                      const v = e.target.value;
                      setJob(v);
                      if (v !== INSURANCE_DESIGNER_JOB) setJobRank("");
                    }}
                    disabled={loading}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 16,
                      outline: "none",
                      background: "#fff",
                    }}
                  >
                    <option value="">선택하세요</option>
                    <option value="직장인">직장인</option>
                    <option value="보험설계사">보험설계사</option>
                    <option value="자영업">자영업</option>
                    <option value="개인사업자">개인사업자</option>
                    <option value="기타">기타</option>
                  </select>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label
                    htmlFor="lead-managed-job-rank"
                    style={{ display: "block", marginBottom: 6, fontSize: 14, color: "var(--text-secondary)" }}
                  >
                    직급 {job === INSURANCE_DESIGNER_JOB ? "(필수)" : ""}
                  </label>
                  <select
                    id="lead-managed-job-rank"
                    value={jobRank}
                    onChange={(e) => setJobRank(e.target.value)}
                    disabled={loading || job !== INSURANCE_DESIGNER_JOB}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 16,
                      outline: "none",
                      background: job === INSURANCE_DESIGNER_JOB ? "#fff" : "#f1f3f5",
                      color: job === INSURANCE_DESIGNER_JOB ? "inherit" : "var(--text-secondary)",
                    }}
                  >
                    <option value="">선택하세요</option>
                    {JOB_RANK_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <p style={{ margin: "0 0 20px", fontSize: 12, color: "var(--text-secondary)" }}>
                  제출 시 상담 안내를 위해 연락드려요.
                </p>

                <PrivacyConsentSection
                  requiredChecked={privacyRequiredChecked}
                  marketingChecked={marketingChecked}
                  onRequiredCheckedChange={setPrivacyRequiredChecked}
                  onMarketingCheckedChange={setMarketingChecked}
                  compact
                />

                <button
                  type="submit"
                  disabled={loading || !privacyRequiredChecked}
                  style={{
                    width: "100%",
                    padding: "14px",
                    background: loading || !privacyRequiredChecked ? "#adb5bd" : "var(--cta-bg)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 16,
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
