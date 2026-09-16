/** 번들에 주입되는 런타임 심 — esbuild alias 대상 */

export const LANDING_IMAGE_SHIM = `
import * as React from "react";

function pxFromSizes(sizes) {
  const s = String(sizes || "").trim();
  if (/^\\d+px$/.test(s)) return s;
  return undefined;
}

export default function Image(props) {
  const {
    src, alt, width, height, fill, sizes, priority, className, style, ...rest
  } = props || {};
  const sizeHint = pxFromSizes(sizes);
  const imgStyle = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", ...(style || {}) }
    : {
        // next/image는 width/height를 레이아웃 힌트로 쓰고 CSS로 축소함.
        // plain <img>에 속성만 넘기면 1639px 등으로 커지므로 height:auto + sizes 힌트를 강제.
        maxWidth: "100%",
        height: "auto",
        ...(sizeHint ? { width: sizeHint } : {}),
        ...(style || {}),
      };
  return React.createElement("img", {
    src,
    alt: alt || "",
    width: fill ? undefined : width,
    height: fill ? undefined : height,
    className,
    style: imgStyle,
    loading: priority ? "eager" : "lazy",
    ...rest
  });
}
`;

export const LANDING_LINK_SHIM = `
import * as React from "react";
export default function Link({ href, children, className, style, ...rest }) {
  return React.createElement("a", { href, className, style, ...rest }, children);
}
`;

export const LANDING_CRM_BRIDGE_SHIM = `
export function __landingCrmBridge(payload, entryPage, landingId) {
  const next = Object.assign({}, payload || {});
  const id =
    (typeof window !== "undefined" && window.__landingId) ||
    landingId;
  next.entry_page = entryPage;
  next.source = next.source || String(entryPage || "").replace(/^\\//, "") || "landing";
  if (id && id !== "__LANDING_ID__") next.landing_id = id;
  next.landing_path = entryPage;
  try {
    if (typeof window !== "undefined" && window.__landingGetSubmissionAnalytics) {
      Object.assign(next, window.__landingGetSubmissionAnalytics());
    }
  } catch (e) {}
  if (next.marketing_consent === true || next.marketing_consent === "true" || next.marketing_consent === "1") {
    next.marketing_consent = 1;
  } else if (!next.marketing_consent || next.marketing_consent === false || next.marketing_consent === "false") {
    next.marketing_consent = null;
  }
  // boolean 동의 필드 정규화 (없으면 레거시 marketing_consent만 유지)
  for (const key of [
    "privacy_required",
    "custom_info_consent",
    "ad_phone_consent",
    "ad_sms_consent",
    "ad_kakao_consent",
    "ad_email_consent",
  ]) {
    if (next[key] === undefined) continue;
    if (next[key] === true || next[key] === "true" || next[key] === "1" || next[key] === 1) next[key] = true;
    else if (next[key] === false || next[key] === "false" || next[key] === "0" || next[key] === 0) next[key] = false;
  }
  if (!next.consent_version) next.consent_version = "2026-09-v2";
  // 레거시 ZIP 폼이 marketing만 보낸 경우 → 채널별 동의로 확장 (TM 호환)
  const marketingOn =
    next.marketing_consent === 1 || next.marketing_consent === true || next.marketing_consent === "1";
  const hasAnyAdField =
    next.ad_phone_consent != null ||
    next.ad_sms_consent != null ||
    next.ad_kakao_consent != null ||
    next.ad_email_consent != null;
  if (marketingOn && !hasAnyAdField) {
    next.ad_phone_consent = true;
    next.ad_sms_consent = true;
    next.ad_kakao_consent = true;
    next.ad_email_consent = true;
  }
  if (next.privacy_required == null) next.privacy_required = true;
  delete next.privacy_consent;
  delete next.website;
  return next;
}
`;

export const LANDING_ENTRY_WRAPPER = `
export { default } from "./__page__";
`;
