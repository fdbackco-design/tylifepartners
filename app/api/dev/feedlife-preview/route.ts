import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { extractZipToMap, stripSingleRootFolder, decodeText } from "@/lib/managedLandings/codeZip/extract";
import { prepareHtmlLanding } from "@/lib/managedLandings/codeZip/html";
import { bundleLandingCode } from "@/lib/managedLandings/codeZip/bundle";
import { rewriteAssetPaths } from "@/lib/managedLandings/codeZip/transform";

export const dynamic = "force-dynamic";
let prepared: Promise<Map<string, Uint8Array>> | undefined;
async function prepare() {
  const directory = join(process.cwd(), "docs");
  const name = (await readdir(directory)).find(n => n.endsWith("20260922.zip"));
  if (!name) throw new Error("검수용 ZIP이 없습니다.");
  const input = stripSingleRootFolder(await extractZipToMap(await readFile(join(directory, name))));
  const result = prepareHtmlLanding(input);
  if (!result) throw new Error("HTML ZIP이 아닙니다.");
  const files = result.files;
  const names = new Set(Array.from(files.keys()).filter(k => k.startsWith("public/assets/")).map(k => k.slice(14)));
  const assetBase = "/api/dev/feedlife-preview?file=assets/";
  const rewrite = (text: string) => rewriteAssetPaths(text, assetBase, names);
  const bundled = await bundleLandingCode({ pageFile: "app/page.tsx", sourceFiles: { "app/page.tsx": rewrite(decodeText(files.get("app/page.tsx")!)) } });
  const output = new Map<string, Uint8Array>();
  for (const [path, bytes] of Array.from(files.entries())) if (path.startsWith("public/")) output.set(path.slice(7), bytes);
  output.set("bundle.js", new TextEncoder().encode(bundled.js));
  output.set("styles.css", new TextEncoder().encode(rewrite(decodeText(files.get("app/globals.css")!))));
  return output;
}
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development" || process.env.LOCAL_REVIEW_MODE !== "1") return new Response(null, { status: 404 });
  prepared ??= prepare().catch(error => { prepared = undefined; throw error; });
  const file = request.nextUrl.searchParams.get("file") || "";
  const bytes = (await prepared).get(file);
  if (!bytes) return new Response(null, { status: 404 });
  const type: Record<string, string> = { js: "application/javascript", css: "text/css", woff2: "font/woff2", png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
  return new Response(bytes as BodyInit, { headers: { "Content-Type": type[file.split(".").pop()!] || "application/octet-stream", "Cache-Control": "no-store" } });
}
