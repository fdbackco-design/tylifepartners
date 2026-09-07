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
  delete next.privacy_consent;
  delete next.website;
  return next;
}
`;

export const LANDING_ENTRY_WRAPPER = `
export { default } from "./__page__";
`;
