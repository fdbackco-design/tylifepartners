/** 번들에 주입되는 런타임 심 — esbuild alias 대상 */

export const LANDING_IMAGE_SHIM = `
import React from "react";
export default function Image(props) {
  const {
    src, alt, width, height, fill, sizes, priority, className, style, ...rest
  } = props || {};
  const imgStyle = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", ...(style || {}) }
    : style;
  return React.createElement("img", {
    src, alt: alt || "", width: fill ? undefined : width, height: fill ? undefined : height,
    className, style: imgStyle, loading: priority ? "eager" : "lazy", ...rest
  });
}
`;

export const LANDING_LINK_SHIM = `
import React from "react";
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
  delete next.privacy_consent;
  delete next.website;
  return next;
}
`;

export const LANDING_ENTRY_WRAPPER = `
export { default } from "./__page__";
`;
