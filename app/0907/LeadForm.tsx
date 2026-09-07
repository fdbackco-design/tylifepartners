"use client";

import { BASE_REGIONS } from "@/lib/regions";
import { trackLeadSubmitEvent } from "@/lib/landing-analytics/client";
import { getSubmissionAnalyticsPayload } from "@/lib/landing-analytics/submissionSnapshot";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { type SyntheticEvent, useMemo, useState } from "react";

type SubmitState = "idle" | "submitting" | "success" | "error";

const JOB_RANKS = ["FC", "팀장 이상", "지점장 이상"] as const;
const LANDING_KEY = "landing_0907";

export default function LeadForm() {
  const [state, setState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [job, setJob] = useState("보험설계사");

  const buttonLabel = useMemo(() => {
    if (state === "submitting") return "상담 요청을 보내는 중…";
    if (state === "success") return "상담 요청이 접수되었습니다";
    return "내게 맞는 방식 상담받기";
  }, [state]);

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length < 4) return digits;
    if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  };

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "submitting" || state === "success") return;

    setState("submitting");
    setErrorMessage("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload: Record<string, FormDataEntryValue | string | number | null> = Object.fromEntries(
      formData.entries()
    );
    const search = new URLSearchParams(window.location.search);
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"]) {
      const value = search.get(key);
      if (value) payload[key] = value;
    }
    payload.entry_page = "/0907";
    payload.source = "0907";
    payload.page_url = window.location.href.slice(0, 500);
    payload.referrer = document.referrer.slice(0, 500);
    payload.marketing_consent = formData.get("marketing_consent") ? 1 : null;
    Object.assign(payload, getSubmissionAnalyticsPayload());
    delete payload.privacy_consent;
    delete payload.website;

    try {
      const response = await fetch("/api/business-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || result.ok === false) {
        throw new Error(result.message || "submit failed");
      }
      trackLeadSubmitEvent(LANDING_KEY);
      const w = window as Window & {
        fbq?: (...args: unknown[]) => void;
        gtag?: (...args: unknown[]) => void;
        karrotPixel?: { track: (event: string, payload?: object) => void };
      };
      w.fbq?.("track", "Lead");
      w.gtag?.("event", "generate_lead", { form_id: "feedlife_recruiting_0907" });
      w.karrotPixel?.track("Lead", { page: "0907" });
      setState("success");
      form.reset();
      setPhone("");
      setJob("보험설계사");
    } catch (err) {
      setErrorMessage(err instanceof Error && err.message !== "submit failed" ? err.message : "");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <output className="form-success">
        <CheckCircle2 size={44} aria-hidden="true" />
        <strong>상담 요청을 확인했습니다.</strong>
        <p>담당자가 내용을 확인한 뒤 순서대로 연락드리겠습니다.</p>
      </output>
    );
  }

  return (
    <form className="lead-form" onSubmit={handleSubmit}>
      <div className="form-heading">
        <span>01</span>
        <div>
          <strong>기본 정보</strong>
          <p>상담에 필요한 최소 정보만 여쭙습니다.</p>
        </div>
      </div>

      <div className="field-grid">
        <label className="field">
          <span>이름</span>
          <input name="name" type="text" autoComplete="name" placeholder="홍길동" required minLength={2} maxLength={10} />
        </label>
        <label className="field">
          <span>연락처</span>
          <input
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="010-0000-0000"
            value={phone}
            onChange={(event) => setPhone(formatPhone(event.target.value))}
            required
          />
        </label>
        <label className="field">
          <span>활동 지역</span>
          <select name="region" defaultValue="" required>
            <option value="" disabled>
              지역 선택
            </option>
            {BASE_REGIONS.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>현재 역할</span>
          <select name="job" value={job} onChange={(event) => setJob(event.target.value)} required>
            <option>보험설계사</option>
            <option>보험조직 관리자</option>
            <option>영업 경력자</option>
            <option>기타</option>
          </select>
        </label>
        <label className="field">
          <span>연령대</span>
          <select name="age_group" defaultValue="" required>
            <option value="" disabled>
              연령대 선택
            </option>
            <option>20대</option>
            <option>30대</option>
            <option>40대</option>
            <option>50대</option>
            <option>60대 이상</option>
          </select>
        </label>
        <label className="field">
          <span>통화하기 좋은 시간</span>
          <select name="available_time" defaultValue="" required>
            <option value="" disabled>
              시간대 선택
            </option>
            <option>오전 9시–12시</option>
            <option>오후 12시–3시</option>
            <option>오후 3시–6시</option>
            <option>오후 6시 이후</option>
            <option>문자로 먼저 안내</option>
          </select>
        </label>
      </div>

      {job === "보험설계사" && (
        <label className="field field-full">
          <span>현재 직책</span>
          <select name="job_rank" defaultValue="FC">
            {JOB_RANKS.map((rank) => (
              <option key={rank} value={rank}>
                {rank}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="honeypot" aria-hidden="true">
        웹사이트 주소
        <input name="website" type="text" tabIndex={-1} autoComplete="off" />
      </label>

      <div className="privacy-box">
        <div className="consent-row">
          <input id="privacy-consent-0907" name="privacy_consent" value="true" type="checkbox" required />
          <label htmlFor="privacy-consent-0907">
            <b>[필수] 개인정보 수집·이용 및 상담 연락에 동의합니다.</b>
            <small>
              수집 주체: 피드백(FEED LIFE) · 항목: 이름, 연락처, 거주지, 연령대, 상담 가능시간, 직업 ·
              목적: 채용 상담 및 관련 안내 · 보유: 동의일로부터 1년
            </small>
            <small>
              동의를 거부할 수 있으나, 거부 시 상담 서비스 이용이 어렵습니다.{" "}
              <Link href="/privacy" target="_blank" rel="noreferrer">
                전체 내용 보기
              </Link>
            </small>
          </label>
        </div>
        <div className="consent-row">
          <input id="marketing-consent-0907" name="marketing_consent" value="1" type="checkbox" />
          <label htmlFor="marketing-consent-0907">
            <b>[선택] 채용 마케팅 광고성 정보 수신에 동의합니다.</b>
            <small>전화·문자·카카오톡·이메일을 통한 이벤트 및 프로모션 안내 · 보유: 수집일로부터 1년</small>
          </label>
        </div>
      </div>

      {state === "error" && (
        <p className="form-error" role="alert">
          {errorMessage || "전송이 원활하지 않습니다. 잠시 후 다시 시도해 주세요."}
        </p>
      )}

      <button className="submit-button" type="submit" disabled={state === "submitting"}>
        {buttonLabel} <ArrowUpRight size={20} aria-hidden="true" />
      </button>
      <p className="form-note">
        상담만 받아보셔도 괜찮습니다. 별도 비용 없이 활동 방식과 상품 구조를 안내해 드립니다.
      </p>
    </form>
  );
}
