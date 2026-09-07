import { createRequire } from "module";
import path from "path";
import { readFileSync } from "fs";
import {
  LANDING_CRM_BRIDGE_SHIM,
  LANDING_ENTRY_WRAPPER,
  LANDING_IMAGE_SHIM,
  LANDING_LINK_SHIM,
} from "@/lib/managedLandings/codeZip/shims";

export type BundleInput = {
  pageCode: string;
  leadFormCode: string | null;
  leadFormImportHint: string | null;
};

export type BundleResult = {
  js: string;
  warnings: string[];
};

type EsbuildApi = {
  build: typeof import("esbuild").build;
  transform: typeof import("esbuild").transform;
};

/** 호스트(Next)와 공유 — 플러그인이 절대경로로 resolve하면 external이 무시되므로 명시 마킹 */
const EXTERNAL_MODULES = new Set([
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  // 아이콘은 호스트 lucide-react 사용 (서버리스에서 전체 번들 시 OOM/타임아웃)
  "lucide-react",
]);

let wasmInitialized = false;

async function loadNativeEsbuild(nodeRequire: NodeRequire): Promise<EsbuildApi> {
  // NFT가 따라갈 수 있도록 문자열 리터럴 resolve
  nodeRequire.resolve("esbuild");
  try {
    nodeRequire.resolve("@esbuild/linux-x64");
  } catch {
    /* local/darwin 등 */
  }
  const esbuild = nodeRequire("esbuild") as EsbuildApi;
  await esbuild.transform("export {}", { loader: "js" });
  return esbuild;
}

async function loadWasmEsbuild(nodeRequire: NodeRequire): Promise<EsbuildApi> {
  const esbuild = nodeRequire("esbuild-wasm") as EsbuildApi & {
    initialize: (opts: { wasmModule?: WebAssembly.Module; worker?: boolean }) => Promise<void>;
  };
  if (!wasmInitialized) {
    const wasmPath = nodeRequire.resolve("esbuild-wasm/esbuild.wasm");
    const wasmModule = await WebAssembly.compile(readFileSync(wasmPath));
    await esbuild.initialize({ wasmModule, worker: false });
    wasmInitialized = true;
  }
  return esbuild;
}

async function loadEsbuild(): Promise<EsbuildApi> {
  const nodeRequire = createRequire(path.resolve(process.cwd(), "package.json"));
  try {
    return await loadNativeEsbuild(nodeRequire);
  } catch (nativeErr) {
    console.warn(
      "native esbuild unavailable, using esbuild-wasm:",
      nativeErr instanceof Error ? nativeErr.message : nativeErr
    );
    try {
      return await loadWasmEsbuild(nodeRequire);
    } catch (wasmErr) {
      const a = nativeErr instanceof Error ? nativeErr.message : String(nativeErr);
      const b = wasmErr instanceof Error ? wasmErr.message : String(wasmErr);
      throw new Error(`esbuild를 초기화하지 못했습니다. native: ${a} / wasm: ${b}`);
    }
  }
}

function formatEsbuildFailure(err: unknown): string {
  if (err && typeof err === "object" && "errors" in err) {
    const errors = (err as { errors?: Array<{ text?: string; location?: { file?: string; line?: number } }> })
      .errors;
    if (errors?.length) {
      return errors
        .map((e) => {
          const loc = e.location ? `${e.location.file || "?"}:${e.location.line || "?"}: ` : "";
          return `${loc}${e.text || "build error"}`;
        })
        .join(" | ");
    }
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * React/Next 랜딩 소스를 호스트 React와 공유하는 CJS 번들로 빌드.
 * lucide-react·react는 external (호스트에서 require 주입).
 */
export async function bundleLandingCode(input: BundleInput): Promise<BundleResult> {
  const esbuild = await loadEsbuild();
  const cwd = process.cwd();
  const nodeRequire = createRequire(path.resolve(cwd, "package.json"));
  const virtualFiles: Record<string, string> = {
    "/virtual/__entry__.js": LANDING_ENTRY_WRAPPER,
    "/virtual/__page__.tsx": input.pageCode,
    "/virtual/__landing_image__.js": LANDING_IMAGE_SHIM,
    "/virtual/__landing_link__.js": LANDING_LINK_SHIM,
    "/virtual/__landing_crm_bridge__.js": LANDING_CRM_BRIDGE_SHIM,
  };

  if (input.leadFormCode && input.leadFormImportHint) {
    const base = input.leadFormImportHint.replace(/^\.\//, "");
    virtualFiles[`/virtual/${base}.tsx`] = input.leadFormCode;
    virtualFiles[`/virtual/${base}.jsx`] = input.leadFormCode;
    virtualFiles[`/virtual/${base}.ts`] = input.leadFormCode;
    virtualFiles[`/virtual/${base}.js`] = input.leadFormCode;
  }

  let result: Awaited<ReturnType<EsbuildApi["build"]>>;
  try {
    result = await esbuild.build({
      absWorkingDir: cwd,
      entryPoints: ["/virtual/__entry__.js"],
      bundle: true,
      write: false,
      format: "cjs",
      platform: "browser",
      target: ["es2019"],
      jsx: "automatic",
      external: Array.from(EXTERNAL_MODULES),
      define: {
        "process.env.NODE_ENV": '"production"',
      },
      logLevel: "silent",
      plugins: [
        {
          name: "virtual-fs",
          setup(build) {
            build.onResolve({ filter: /.*/ }, (args) => {
              // 반드시 절대경로 resolve보다 먼저 — 안 그러면 React가 번들에 포함되어
              // 호스트 React와 이중 로딩 → 런타임 "(void 0) is not a function"
              if (EXTERNAL_MODULES.has(args.path)) {
                return { path: args.path, external: true };
              }

              if (args.path === "__landing_image__") {
                return { path: "/virtual/__landing_image__.js", namespace: "virtual" };
              }
              if (args.path === "__landing_link__") {
                return { path: "/virtual/__landing_link__.js", namespace: "virtual" };
              }
              if (args.path === "__landing_crm_bridge__") {
                return { path: "/virtual/__landing_crm_bridge__.js", namespace: "virtual" };
              }
              if (args.path === "./__page__" || args.path === "__page__") {
                return { path: "/virtual/__page__.tsx", namespace: "virtual" };
              }

              if (args.path.startsWith("/virtual/")) {
                return { path: args.path, namespace: "virtual" };
              }

              if (
                (args.path.startsWith("./") || args.path.startsWith("../")) &&
                (args.namespace === "virtual" || args.importer.startsWith("/virtual/"))
              ) {
                const importerPath = args.importer.replace(/^virtual:/, "");
                const dir = path.posix.dirname(importerPath);
                const resolved = path.posix.normalize(path.posix.join(dir, args.path));
                const candidates = [
                  resolved,
                  `${resolved}.tsx`,
                  `${resolved}.jsx`,
                  `${resolved}.ts`,
                  `${resolved}.js`,
                ];
                for (const c of candidates) {
                  if (virtualFiles[c]) return { path: c, namespace: "virtual" };
                }
                return {
                  errors: [
                    {
                      text: `ZIP 내부 상대 경로를 해석할 수 없습니다: ${args.path} (from ${importerPath})`,
                    },
                  ],
                };
              }

              // bare imports — node_modules (lucide/react는 위에서 external)
              if (!args.path.startsWith(".") && !args.path.startsWith("/")) {
                // @/ alias, next/* 등 미지원
                if (args.path.startsWith("@/") || args.path.startsWith("next/")) {
                  return {
                    errors: [
                      {
                        text: `지원하지 않는 import 입니다: ${args.path}. next/image·next/link·lucide-react·상대경로만 사용해주세요.`,
                      },
                    ],
                  };
                }
                try {
                  return {
                    path: nodeRequire.resolve(args.path),
                    namespace: "file",
                  };
                } catch {
                  return {
                    errors: [
                      {
                        text: `패키지를 찾을 수 없습니다: ${args.path}. 호스트에 설치된 패키지(lucide-react 등)만 사용하거나 상대경로로 포함해주세요.`,
                      },
                    ],
                  };
                }
              }

              return undefined;
            });

            build.onLoad({ filter: /.*/, namespace: "virtual" }, (args) => {
              const contents = virtualFiles[args.path];
              if (contents == null) return null;
              const loader = args.path.endsWith(".tsx")
                ? "tsx"
                : args.path.endsWith(".jsx")
                  ? "jsx"
                  : args.path.endsWith(".ts")
                    ? "ts"
                    : "js";
              return { contents, loader };
            });
          },
        },
      ],
    });
  } catch (e) {
    throw new Error(`번들 실패: ${formatEsbuildFailure(e)}`);
  }

  const js = result.outputFiles?.[0]?.text;
  if (!js) throw new Error("번들 결과가 비어 있습니다.");

  return {
    js,
    warnings: (result.warnings || []).map((w: { text: string }) => w.text),
  };
}
