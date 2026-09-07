"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PrivacyConsentSection from "@/app/_components/PrivacyConsentSection";
import { getSubmissionAnalyticsPayload } from "@/lib/landing-analytics/submissionSnapshot";
import {
  DEFAULT_FORM_CONFIG,
  normalizeFormConfig,
  resolveAllowedRegions,
  type ManagedFormConfig,
} from "@/lib/managedLandings/formConfig";
import { formatRegionValue, getDistrictsForRegion } from "@/lib/regions";
import { attributionFieldsFromUtm } from "@/lib/utm";
import { useUTM } from "@/lib/useUTM";

const CONSULTATION_ICON = "/assets/icon-consultation-write.png";
const INSURANCE_DESIGNER_JOB = "보험설계사";
const JOB_RANK_OPTIONS = ["지점장 이상", "팀장 이상", "FC"] as const;

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

type Props = {
  id: string;
  path: string;
  formConfig?: ManagedFormConfig | null;
};

/**
 * 코드 ZIP 랜딩용 하단 고정 CTA + 상담 시트.
 * feedlife:consult 이벤트를 가로채 시트를 연다 (CRM / 히트맵 스냅샷 연동).
 */
export default function CodeLandingConsultOverlay({ id, path, formConfig: formConfigProp }: Props) {
  const router = useRouter();
  const formConfig = normalizeFormConfig(formConfigProp ?? DEFAULT_FORM_CONFIG);
  const allowedRegions = resolveAllowedRegions(formConfig);
  const utm = useUTM();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [region, setRegion] = useState("");
  const [district, setDistrict] = useState("");
  const [availableTime, setAvailableTime] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [job, setJob] = useState("");
  const [jobRank, setJobRank] = useState("");
  const [privacyRequiredChecked, setPrivacyRequiredChecked] = useState(false);
  const [marketingChecked, setMarketingChecked] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [consultSource, setConsultSource] = useState<string | null>(null);

  const showToast = useCallback((msg: string, error?: boolean) => {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 2500);
  }, []);

  const openSheet = useCallback((source?: string | null) => {
    if (submitted) return;
    setConsultSource(source || null);
    setSheetOpen(true);
  }, [submitted]);

  const closeSheet = useCallback(() => setSheetOpen(false), []);

  useEffect(() => {
    const onConsult = (event: Event) => {
      const e = event as CustomEvent;
      e.preventDefault();
      const source =
        e.detail && typeof e.detail === "object" && "source" in e.detail
          ? String((e.detail as { source?: string }).source || "")
          : "";
      openSheet(source || null);
    };
    window.addEventListener("feedlife:consult", onConsult);
    return () => window.removeEventListener("feedlife:consult", onConsult);
  }, [openSheet]);

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
    if (formConfig.includeRegion && !region) {
      showToast("지역을 선택해주세요.", true);
      return;
    }
    if (formConfig.includeRegion && region && !allowedRegions.includes(region as (typeof allowedRegions)[number])) {
      showToast("선택할 수 없는 지역입니다.", true);
      return;
    }
    if (formConfig.includeRegion && formConfig.allowRegionDetail && !district) {
      showToast("상세 지역을 선택해주세요.", true);
      return;
    }
    if (formConfig.includeAvailableTime && !availableTime) {
      showToast("상담가능시간을 선택해주세요.", true);
      return;
    }
    if (formConfig.includeAgeGroup && !ageGroup) {
      showToast("연령대를 선택해주세요.", true);
      return;
    }
    if (formConfig.includeJob && job === INSURANCE_DESIGNER_JOB && !jobRank) {
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
          source: utm.utm_source || path.replace(/^\//, "") || "landing",
          ...attributionFieldsFromUtm(utm),
          marketing_consent: marketingChecked ? 1 : null,
          region: formConfig.includeRegion
            ? formatRegionValue(region, formConfig.allowRegionDetail ? district : null)
            : null,
          available_time: formConfig.includeAvailableTime ? availableTime : null,
          age_group: formConfig.includeAgeGroup ? ageGroup : null,
          job: formConfig.includeJob ? job || null : null,
          job_rank: formConfig.includeJob && job === INSURANCE_DESIGNER_JOB ? jobRank : null,
          entry_page: path,
          landing_id: id,
          landing_path: path,
          consult_source: consultSource,
          page_url: typeof window !== "undefined" ? window.location.href.slice(0, 500) : null,
          referrer: typeof document !== "undefined" ? document.referrer.slice(0, 500) : null,
          ...getSubmissionAnalyticsPayload(),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        try {
          window.__landingTrackLeadSubmit?.();
        } catch {
          /* ignore */
        }
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

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 16,
    outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: 6,
    fontSize: 14,
    color: "var(--text-secondary)",
  };

  return (
    <>
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "10px 16px",
          paddingBottom: "calc(10px + var(--safe-bottom, 0px))",
          background: "var(--bg-page, #fff)",
          maxWidth: 480,
          margin: "0 auto",
          boxShadow: "0 -2px 10px rgba(0,0,0,0.06)",
          zIndex: 40,
        }}
      >
        <button
          type="button"
          onClick={() => openSheet("host-sticky")}
          disabled={submitted}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            width: "100%",
            padding: "15px 18px",
            background: submitted ? "#adb5bd" : "var(--cta-bg, #5b19c6)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius, 10px)",
            fontSize: 22,
            fontWeight: 800,
            cursor: submitted ? "default" : "pointer",
          }}
        >
          {!submitted && (
            <span
              aria-hidden
              style={{
                width: 22,
                height: 22,
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
              background: "var(--bg-card, #fff)",
              borderRadius: "16px 16px 0 0",
              boxShadow: "0 -4px 20px rgba(0,0,0,0.1)",
              zIndex: 51,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "24px 20px",
                paddingBottom: "calc(24px + var(--safe-bottom, 0px))",
                overflowY: "auto",
                flex: 1,
                minHeight: 0,
                WebkitOverflowScrolling: "touch",
              }}
            >
              <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 600 }}>파트너 상담</h2>
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 16 }}>
                  <label htmlFor="code-lead-name" style={labelStyle}>
                    이름 (한글 2~10자)
                  </label>
                  <input
                    id="code-lead-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="홍길동"
                    maxLength={10}
                    disabled={loading}
                    style={fieldStyle}
                  />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label htmlFor="code-lead-phone" style={labelStyle}>
                    연락처 (010-0000-0000)
                  </label>
                  <input
                    id="code-lead-phone"
                    type="tel"
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="010-1234-5678"
                    inputMode="numeric"
                    maxLength={13}
                    disabled={loading}
                    style={fieldStyle}
                  />
                </div>
                {formConfig.includeRegion && (
                  <div style={{ marginBottom: 16 }}>
                    <label htmlFor="code-lead-region" style={labelStyle}>
                      지역 (필수)
                    </label>
                    <select
                      id="code-lead-region"
                      value={region}
                      onChange={(e) => {
                        setRegion(e.target.value);
                        setDistrict("");
                      }}
                      disabled={loading}
                      style={fieldStyle}
                    >
                      <option value="">선택</option>
                      {allowedRegions.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    {formConfig.allowRegionDetail && region ? (
                      <select
                        aria-label="상세 지역"
                        value={district}
                        onChange={(e) => setDistrict(e.target.value)}
                        disabled={loading}
                        style={{ ...fieldStyle, marginTop: 8 }}
                      >
                        <option value="">상세 지역 선택</option>
                        {getDistrictsForRegion(region).map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                )}
                {formConfig.includeAvailableTime && (
                  <div style={{ marginBottom: 16 }}>
                    <label htmlFor="code-lead-time" style={labelStyle}>
                      상담가능시간
                    </label>
                    <select
                      id="code-lead-time"
                      value={availableTime}
                      onChange={(e) => setAvailableTime(e.target.value)}
                      disabled={loading}
                      style={fieldStyle}
                    >
                      <option value="">선택</option>
                      <option value="오전">오전</option>
                      <option value="오후">오후</option>
                      <option value="저녁">저녁</option>
                      <option value="상관없음">상관없음</option>
                    </select>
                  </div>
                )}
                {formConfig.includeAgeGroup && (
                  <div style={{ marginBottom: 16 }}>
                    <label htmlFor="code-lead-age" style={labelStyle}>
                      연령대
                    </label>
                    <select
                      id="code-lead-age"
                      value={ageGroup}
                      onChange={(e) => setAgeGroup(e.target.value)}
                      disabled={loading}
                      style={fieldStyle}
                    >
                      <option value="">선택</option>
                      <option value="20대">20대</option>
                      <option value="30대">30대</option>
                      <option value="40대">40대</option>
                      <option value="50대">50대</option>
                      <option value="60대 이상">60대 이상</option>
                    </select>
                  </div>
                )}
                {formConfig.includeJob && (
                  <>
                    <div style={{ marginBottom: 16 }}>
                      <label htmlFor="code-lead-job" style={labelStyle}>
                        현재 역할
                      </label>
                      <select
                        id="code-lead-job"
                        value={job}
                        onChange={(e) => {
                          setJob(e.target.value);
                          if (e.target.value !== INSURANCE_DESIGNER_JOB) setJobRank("");
                        }}
                        disabled={loading}
                        style={fieldStyle}
                      >
                        <option value="">선택</option>
                        <option value="보험설계사">보험설계사</option>
                        <option value="보험조직 관리자">보험조직 관리자</option>
                        <option value="영업 경험자">영업 경험자</option>
                        <option value="기타">기타</option>
                      </select>
                    </div>
                    {job === INSURANCE_DESIGNER_JOB && (
                      <div style={{ marginBottom: 16 }}>
                        <label htmlFor="code-lead-rank" style={labelStyle}>
                          직급
                        </label>
                        <select
                          id="code-lead-rank"
                          value={jobRank}
                          onChange={(e) => setJobRank(e.target.value)}
                          disabled={loading}
                          style={fieldStyle}
                        >
                          <option value="">선택</option>
                          {JOB_RANK_OPTIONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </>
                )}
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
                    marginTop: 16,
                    padding: "14px 18px",
                    background: loading || !privacyRequiredChecked ? "#adb5bd" : "var(--cta-bg, #5b19c6)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    fontSize: 17,
                    fontWeight: 700,
                    cursor: loading || !privacyRequiredChecked ? "default" : "pointer",
                  }}
                >
                  {loading ? "제출 중…" : "상담 신청하기"}
                </button>
              </form>
            </div>
          </div>
        </>
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            left: "50%",
            bottom: 100,
            transform: "translateX(-50%)",
            zIndex: 60,
            padding: "10px 16px",
            borderRadius: 8,
            background: toast.error ? "#c0392b" : "#2c3e50",
            color: "#fff",
            fontSize: 14,
            maxWidth: "90%",
          }}
        >
          {toast.msg}
        </div>
      )}
    </>
  );
}
