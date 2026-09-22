"use client";

import { useEffect, useRef } from "react";
import { installConsentForm } from "@/lib/feedlife/consent-form.mjs";
import { attributionFieldsFromUtm, parseUTMFromUrl } from "@/lib/utm";
import { getSubmissionAnalyticsPayload } from "@/lib/landing-analytics/submissionSnapshot";
import { useUTM } from "@/lib/useUTM";
import "./feedlife-consent.css";

type Payload = {
  name: string; phone: string; region: string; consentVersion: string;
  consultationTime?: string; ageBand?: string; currentRole?: string;
  consent: { requiredPrivacy: boolean; optionalConsultation: boolean };
};
type Install = (options: {
  privacyHref: string; root: HTMLElement;
  onSubmit: (payload: Payload) => Promise<{ ok: true; submissionId: string }>;
}) => { open: (trigger: HTMLElement | null) => void; destroy: () => void };

export default function FeedlifeConsultForm({ id, path }: { id: string; path: string }) {
  const form = useRef<ReturnType<Install> | null>(null);
  const utm = useUTM();
  const utmRef = useRef(utm);
  utmRef.current = utm;
  const source = useRef<string | null>(null);
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".landing-code")!;
    const onConsult = (event: Event) => { source.current = (event as CustomEvent).detail?.source || null; };
    window.addEventListener("feedlife:consult", onConsult);
    const installed = (installConsentForm as unknown as Install)({
      root, privacyHref: "/feedlife-privacy.html",
      onSubmit: async payload => {
        const res = await fetch("/api/business-lead", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: payload.name, phone: payload.phone, region: payload.region,
            available_time: payload.consultationTime,
            age_group: payload.consent.optionalConsultation ? payload.ageBand : undefined,
            job: payload.consent.optionalConsultation ? payload.currentRole : undefined,
            privacy_required: payload.consent.requiredPrivacy,
            custom_info_consent: payload.consent.optionalConsultation,
            marketing_consent: null, ad_phone_consent: false, ad_sms_consent: false,
            ad_kakao_consent: false, ad_email_consent: false,
            consent_version: payload.consentVersion,
            landing_id: id, landing_path: path, entry_page: path,
            source: parseUTMFromUrl(window.location.search).utm_source || utmRef.current.utm_source || path.slice(1),
            consult_source: source.current,
            referrer: document.referrer.slice(0, 500),
            page_url: window.location.href.slice(0, 500),
            ...attributionFieldsFromUtm({ ...utmRef.current, ...parseUTMFromUrl(window.location.search) }),
            ...getSubmissionAnalyticsPayload(),
          }),
        });
        const result = await res.json();
        if (!res.ok || !result.ok || !result.lead_id) {
          const error = new Error("접수 확인 실패") as Error & { errors?: {message: string}[] };
          if (res.status === 400 && Array.isArray(result.errors)) error.errors = result.errors;
          else if (res.status === 409) error.errors = [{ message: result.message }];
          throw error;
        }
        try { window.__landingTrackLeadSubmit?.(); } catch { /* Tracking must not turn a saved submission into a retry. */ }
        return { ok: true, submissionId: result.lead_id };
      },
    });
    form.current = installed;
    return () => { window.removeEventListener("feedlife:consult", onConsult); installed.destroy(); form.current = null; };
  }, [id, path]);
  return <div className="fl-host-sticky"><button type="button" className="fl-submit" onClick={e => { source.current = "host-sticky"; form.current?.open(e.currentTarget); }}>상담 신청하기</button></div>;
}
