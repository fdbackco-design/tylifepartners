import { posix } from "node:path";
import { decodeText, findBySuffix, type ZipFileMap } from "./extract";
import { injectAnalyticsSectionAttrs, type SectionMarker } from "./transform";

/** Static FEED LIFE handoff: scripts/forms are owned by the host, never installed twice. */
export function prepareHtmlLanding(files: ZipFileMap): { files: ZipFileMap; profile: "feedlife-v5"; markers: SectionMarker[]; entry: string } | null {
  // Preserve React/Vite archives that also contain their HTML entry shell.
  if (findBySuffix(files, ["app/page.tsx", "app/page.jsx", "page.tsx", "page.jsx", "App.tsx"])) return null;
  const entry = files.has("web/index.html") ? "web/index.html" : files.has("index.html") ? "index.html" : null;
  if (!entry) return null;
  const root = posix.dirname(entry);
  const config = files.get(posix.join(root, "consent-config.mjs"));
  if (!config || !decodeText(config).includes("2026-09-22.v5")) {
    throw new Error("HTML ZIP은 FEED LIFE v5 전달 형식을 지원합니다. index.html과 consent-config.mjs를 확인해주세요.");
  }
  const html = decodeText(files.get(entry)!);
  const scripts = Array.from(html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi));
  if (scripts.some(([, attrs, text]) => text.trim() || !/src=["']\.\/init\.mjs["']/.test(attrs))) {
    throw new Error("지원하지 않는 HTML 스크립트입니다. 랜딩 동작은 CRM과 별도 연동이 필요합니다.");
  }
  let body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1];
  if (!body) throw new Error("HTML body를 찾지 못했습니다.");
  body = body.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
  if (/<(?:iframe|form|object|embed)\b|\son\w+\s*=|javascript:/i.test(body)) {
    throw new Error("HTML 본문에 지원하지 않는 폼 또는 실행 코드가 있습니다.");
  }
  body = body.replace(/(["'])\.\/assets\//g, "$1/assets/")
    .replace(/(["'])\.\/privacy\.html\1/g, '$1/feedlife-privacy.html$1');
  const annotated = injectAnalyticsSectionAttrs(body);
  body = annotated.code;
  const generated: ZipFileMap = new Map();
  const encode = (s: string) => new TextEncoder().encode(s);
  for (const [path, bytes] of Array.from(files.entries())) {
    const prefix = posix.join(root, "assets") + "/";
    if (path.startsWith(prefix)) generated.set("public/assets/" + path.slice(prefix.length), bytes);
  }
  const visiting = new Set<string>();
  function css(path: string): string {
    if (visiting.has(path)) throw new Error("CSS import 순환 참조입니다.");
    const bytes = files.get(path);
    if (!bytes) throw new Error(`CSS 파일이 없습니다: ${path}`);
    visiting.add(path);
    let source = decodeText(bytes).replace(/@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?\s*;/g,
      (_match, relative: string) => css(posix.normalize(posix.join(posix.dirname(path), relative))));
    source = source.replace(/url\(\s*(["']?)([^)"']+)\1\s*\)/g, (match, _quote, relative: string) => {
      if (/^(data:|https?:|\/)/.test(relative)) return match;
      const absolute = posix.normalize(posix.join(posix.dirname(path), relative));
      const prefix = posix.join(root, "assets") + "/";
      if (!absolute.startsWith(prefix) || !files.has(absolute)) throw new Error(`CSS 에셋이 없습니다: ${relative}`);
      return `url("/assets/${absolute.slice(prefix.length)}")`;
    });
    visiting.delete(path);
    return source;
  }
  const styles = Array.from(html.matchAll(/<link\b[^>]*href=["']([^"']+\.css)["'][^>]*>/gi))
    .filter(([, href]) => posix.basename(href) !== "consent.css")
    .map(([, href]) => css(posix.normalize(posix.join(root, href))));
  // The host owns consent styling; uploading an old ZIP must not override fixes.
  styles.push(...Array.from(html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)).map(m => m[1]));
  generated.set("app/globals.css", encode(styles.join("\n")));
  generated.set("app/page.tsx", encode(`import React from "react";
const html = ${JSON.stringify(body)};
export default function Page() {
 return <div onClick={event => {
   const button = event.target.closest?.("[data-feedlife-consult]");
   if (!button) return;
   event.preventDefault();
   window.dispatchEvent(new CustomEvent("feedlife:consult", {cancelable:true, detail:{source:button.dataset.consultSource, pageUrl:window.location.href}}));
 }} dangerouslySetInnerHTML={{__html:html}} />;
}`));
  return { files: generated, profile: "feedlife-v5", markers: annotated.markers, entry };
}
