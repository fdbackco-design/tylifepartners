"use client";

import { useEffect, useState, type ComponentType } from "react";
import * as React from "react";
import * as ReactJSXRuntime from "react/jsx-runtime";
import LandingAnalyticsTracker from "@/app/_components/LandingAnalyticsTracker";
import { useMeasuredLandingSections } from "@/app/_components/useMeasuredLandingSections";
import { trackLeadSubmitEvent } from "@/lib/landing-analytics/client";
import { getSubmissionAnalyticsPayload } from "@/lib/landing-analytics/submissionSnapshot";
import { landingKeyForManaged } from "@/lib/managedLandings/types";
import type { ManagedLandingSection } from "@/lib/managedLandings/types";

type Props = {
  id: string;
  slug: string;
  path: string;
  title: string;
  bundleUrl: string;
  cssUrl: string | null;
  sections?: ManagedLandingSection[] | null;
};

declare global {
  interface Window {
    __landingId?: string;
    __landingGetSubmissionAnalytics?: () => Record<string, unknown>;
    __landingTrackLeadSubmit?: () => void;
  }
}

function loadScriptCjs(code: string): { default?: ComponentType } {
  const module: { exports: unknown } = { exports: {} };
  const exports = module.exports;
  const require = (name: string) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return ReactJSXRuntime;
    if (name === "react/jsx-dev-runtime") return ReactJSXRuntime;
    if (name === "react-dom" || name === "react-dom/client") {
      throw new Error(`'${name}'는 코드 ZIP 랜딩에서 지원하지 않습니다.`);
    }
    throw new Error(`Cannot require '${name}' in landing bundle`);
  };
  // eslint-disable-next-line no-new-func
  const fn = new Function("require", "module", "exports", code);
  fn(require, module, exports);
  const mod = module.exports;
  // CJS interop: module.exports = Component 또는 { default: Component }
  if (typeof mod === "function") {
    return { default: mod as ComponentType };
  }
  if (mod && typeof mod === "object" && "default" in mod) {
    const def = (mod as { default?: unknown }).default;
    if (typeof def === "function") return { default: def as ComponentType };
  }
  return {};
}

export default function CodeLandingRuntime({
  id,
  slug,
  path,
  title,
  bundleUrl,
  cssUrl,
  sections: sectionsFallback,
}: Props) {
  const landingKey = landingKeyForManaged(slug);
  const measured = useMeasuredLandingSections(".landing-code");
  const sections = measured?.length ? measured : sectionsFallback ?? null;
  const [Page, setPage] = useState<ComponentType | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = title || "상담 안내";
  }, [title]);

  useEffect(() => {
    window.__landingId = id;
    window.__landingGetSubmissionAnalytics = () => getSubmissionAnalyticsPayload();
    window.__landingTrackLeadSubmit = () => trackLeadSubmitEvent(landingKey);
    return () => {
      delete window.__landingId;
      delete window.__landingGetSubmissionAnalytics;
      delete window.__landingTrackLeadSubmit;
    };
  }, [id, landingKey]);

  useEffect(() => {
    let cancelled = false;
    let linkEl: HTMLLinkElement | null = null;

    (async () => {
      try {
        if (cssUrl) {
          linkEl = document.createElement("link");
          linkEl.rel = "stylesheet";
          linkEl.href = cssUrl;
          document.head.appendChild(linkEl);
        }

        const res = await fetch(bundleUrl, { credentials: "omit" });
        if (!res.ok) throw new Error(`번들을 불러오지 못했습니다 (${res.status})`);
        const code = await res.text();
        if (cancelled) return;

        const mod = loadScriptCjs(code);
        if (!mod.default) throw new Error("번들에 default export가 없습니다.");
        setPage(() => mod.default!);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      if (linkEl?.parentNode) linkEl.parentNode.removeChild(linkEl);
    };
  }, [bundleUrl, cssUrl]);

  return (
    <div className="landing-code" data-landing-path={path}>
      <style>{`
        body:has(.landing-code) { background: #f7f4ec; margin: 0; }
        body:has(.landing-code) main { max-width: none !important; width: 100% !important; margin: 0 !important; padding-bottom: 0 !important; }
        .landing-code { min-height: 100vh; width: 100%; }
        .landing-code-error { padding: 48px 24px; text-align: center; color: #b53535; font-family: sans-serif; }
      `}</style>
      {Page ? <LandingAnalyticsTracker landingKey={landingKey} sections={sections} /> : null}
      {error ? <div className="landing-code-error">{error}</div> : null}
      {Page ? <Page /> : null}
    </div>
  );
}
