/** TSX/CSS의 에셋 경로를 Storage public URL로 치환 */
export function rewriteAssetPaths(
  source: string,
  assetBase: string,
  uploadedNames: Set<string>
): string {
  const base = assetBase.endsWith("/") ? assetBase : `${assetBase}/`;

  let out = source;
  // "/assets/foo.webp" | '/assets/foo.webp'
  out = out.replace(/(["'`])\/assets\/([^"'`]+)\1/g, (full, quote, rest) => {
    const name = String(rest).split("?")[0];
    if (!uploadedNames.has(name) && !uploadedNames.has(`assets/${name}`)) {
      // still rewrite — file may exist under public/assets
    }
    return `${quote}${base}${name}${quote}`;
  });

  // src={"/assets/..."} already covered
  // url(/assets/...) in CSS
  out = out.replace(/url\(\s*(['"]?)\/assets\/([^)'"]+)\1\s*\)/g, (_m, _q, rest) => {
    const name = String(rest).split("?")[0];
    return `url(${base}${name})`;
  });

  return out;
}

/** next/image → 단순 img, Link → a 등 런타임 심 친화적 변환 */
export function rewriteNextImports(source: string): string {
  let out = source;
  out = out.replace(
    /import\s+Image\s+from\s+["']next\/image["'];?/g,
    `import Image from "__landing_image__";`
  );
  out = out.replace(
    /import\s+Link\s+from\s+["']next\/link["'];?/g,
    `import Link from "__landing_link__";`
  );
  // relative lead form imports stay; bundler resolves via virtual FS
  return out;
}

export type SectionMarker = { name: string; label: string };

/**
 * <section ...> / <footer ...>에 data-analytics-section 자동 부여
 * (이미 있으면 유지)
 */
export function injectAnalyticsSectionAttrs(tsx: string): {
  code: string;
  markers: SectionMarker[];
} {
  const markers: SectionMarker[] = [];
  let sectionIndex = 0;

  const code = tsx.replace(/<(section|footer)(\s[^>]*)?>/gi, (full, tag: string, attrs = "") => {
    if (/data-analytics-section\s*=/.test(attrs)) {
      const nameMatch = attrs.match(/data-analytics-section=["']([^"']+)["']/);
      const labelMatch = attrs.match(/data-analytics-label=["']([^"']+)["']/);
      if (nameMatch) {
        markers.push({
          name: nameMatch[1],
          label: labelMatch?.[1] || nameMatch[1],
        });
      }
      return full;
    }

    sectionIndex += 1;
    const name = `section_${String(sectionIndex).padStart(2, "0")}`;
    const labelGuess =
      attrs.match(/\bid=["']([^"']+)["']/)?.[1] ||
      attrs.match(/className=["']([^"']+)["']/)?.[1]?.split(/\s+/)[0] ||
      tag;
    const label = `${sectionIndex}. ${labelGuess}`;
    markers.push({ name, label });

    const inject = ` data-analytics-section="${name}" data-analytics-label="${escapeAttr(label)}"`;
    if (attrs.endsWith("/")) {
      // unlikely for section
      return `<${tag}${attrs.slice(0, -1)}${inject} />`;
    }
    return `<${tag}${attrs}${inject}>`;
  });

  return { code, markers };
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Lead form에 CRM/analytics 필드를 주입할 수 있도록
 * business-lead fetch 직전 payload를 패치하는 헬퍼 import 추가
 */
export function injectLeadFormCrmBridge(
  leadFormSource: string,
  opts: { entryPage: string; landingIdPlaceholder: string }
): string {
  let out = leadFormSource;

  // Ensure fetch goes to business-lead (already often does)
  out = out.replace(
    /fetch\(\s*["']https?:\/\/[^"']+\/api\/business-lead["']/g,
    `fetch("/api/business-lead"`
  );

  const bridgeImport = `import { __landingCrmBridge } from "__landing_crm_bridge__";\n`;
  if (!out.includes("__landing_crm_bridge__")) {
    if (/^["']use client["'];?\s*/.test(out)) {
      out = out.replace(/^(["']use client["'];?\s*)/, `$1${bridgeImport}`);
    } else {
      out = bridgeImport + out;
    }
  }

  // After Object.fromEntries / payload build, before fetch — inject bridge call
  // Heuristic: find JSON.stringify(payload) and wrap payload
  if (!out.includes("__landingCrmBridge(")) {
    out = out.replace(
      /body:\s*JSON\.stringify\(\s*payload\s*\)/g,
      `body: JSON.stringify(__landingCrmBridge(payload, ${JSON.stringify(opts.entryPage)}, ${JSON.stringify(opts.landingIdPlaceholder)}))`
    );
  }

  return out;
}
