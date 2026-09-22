import test from "node:test";
import assert from "node:assert/strict";
import { prepareHtmlLanding } from "./html";
import { decodeText } from "./extract";
import { rewriteAssetPaths } from "./transform";
import { bundleLandingCode } from "./bundle";
import * as React from "react";
import * as JSX from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

const bytes = (text: string) => new TextEncoder().encode(text);
function fixture() {
  return new Map([
    ["web/index.html", bytes('<html><head><link href="./landing.css" rel="stylesheet"><link href="./consent.css" rel="stylesheet"></head><body><main><section id="hero"><img src="./assets/photo.webp"></section><a href="./privacy.html">Privacy</a></main><script type="module" src="./init.mjs"></script></body></html>')],
    ["web/consent-config.mjs", bytes("export const CONSENT_VERSION = '2026-09-22.v5';")],
    ["web/landing.css", bytes('@import url("./assets/fonts/font.css"); body {color:purple}')],
    ["web/assets/fonts/font.css", bytes('@font-face {font-family:test; src:url("./test.woff2")}')],
    ["web/assets/fonts/test.woff2", bytes("font")],
    ["web/assets/photo.webp", bytes("image")],
  ]);
}
test("HTML ZIP preserves markers, assets and nested fonts, and uses the host privacy page", async () => {
  const result = prepareHtmlLanding(fixture())!;
  assert.equal(result.markers.length, 1);
  assert.equal(result.markers[0].name, "section_01");
  assert.match(decodeText(result.files.get("app/globals.css")!), /\/assets\/fonts\/test.woff2/);
  const source = rewriteAssetPaths(decodeText(result.files.get("app/page.tsx")!), "https://assets.example/", new Set());
  const bundle = await bundleLandingCode({pageFile: "app/page.tsx", sourceFiles: {"app/page.tsx": source}});
  const module = {exports: {} as {default: React.ComponentType}};
  new Function("require", "module", "exports", bundle.js)((name: string) => name === "react" ? React : JSX, module, module.exports);
  const html = renderToStaticMarkup(React.createElement(module.exports.default));
  assert.match(html, /src="https:\/\/assets.example\/photo.webp"/);
  assert.match(html, /data-analytics-section="section_01"/);
  assert.match(html, /href="\/feedlife-privacy.html"/);
  assert.doesNotMatch(html, /<script/);
});
test("React archives with an index.html shell still use the React path", () => {
  const files = fixture(); files.set("App.tsx", bytes("export default function App(){return null}"));
  assert.equal(prepareHtmlLanding(files), null);
});
test("unknown HTML and executable body scripts fail explicitly", () => {
  assert.throws(() => prepareHtmlLanding(new Map([["index.html", bytes("<body>test</body>")]])), /HTML ZIP/);
  const files = fixture(); files.set("web/index.html", bytes('<body><script>alert(1)</script></body>'));
  assert.throws(() => prepareHtmlLanding(files), /스크립트/);
});
