import { existsSync, readFileSync } from "node:fs";
import { dirname, join, posix as pathPosix } from "node:path";
import {
  LANDING_CRM_BRIDGE_SHIM,
  LANDING_IMAGE_SHIM,
  LANDING_LINK_SHIM,
} from "@/lib/managedLandings/codeZip/shims";

export type BundleInput = {
  /** ZIP 내 페이지 경로 (예: app/page.tsx) */
  pageFile: string;
  /** ZIP 상대경로 → 변환된 소스 */
  sourceFiles: Record<string, string>;
};

export type BundleResult = {
  js: string;
  warnings: string[];
};

type EsbuildApi = {
  build: typeof import("esbuild").build;
  transform: typeof import("esbuild").transform;
};

type EsbuildWasmApi = EsbuildApi & {
  initialize: (opts: {
    wasmModule?: WebAssembly.Module;
    wasmURL?: string | URL;
    worker?: boolean;
  }) => Promise<void>;
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
let cachedApi: EsbuildApi | null = null;

/**
 * webpack이 createRequire/path default import를 깨뜨려 require.resolve가 사라지는 경우가 있음.
 * 서버리스에서는 Node 실제 require를 우선 확보한다.
 */
function nodeRequire(): NodeRequire {
  const candidates: Array<() => NodeRequire> = [
    () => {
      // webpack 우회 — 런타임 Node require
      // eslint-disable-next-line no-eval, @typescript-eslint/no-unsafe-call
      return eval("require") as NodeRequire;
    },
    () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createRequire } = require("node:module") as typeof import("node:module");
      return createRequire(join(process.cwd(), "package.json"));
    },
    () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createRequire } = require("module") as typeof import("module");
      return createRequire(join(process.cwd(), "package.json"));
    },
  ];

  const errors: string[] = [];
  for (const make of candidates) {
    try {
      const req = make();
      if (typeof req === "function" && typeof req.resolve === "function") {
        return req;
      }
      errors.push("require.resolve 없음");
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error(`Node require를 확보하지 못했습니다: ${errors.join(" / ")}`);
}

function resolveWasmPath(req: NodeRequire): string {
  const candidates = [
    () => req.resolve("esbuild-wasm/esbuild.wasm"),
    () => join(dirname(req.resolve("esbuild-wasm/package.json")), "esbuild.wasm"),
    () => join(process.cwd(), "node_modules", "esbuild-wasm", "esbuild.wasm"),
    () => join("/var/task", "node_modules", "esbuild-wasm", "esbuild.wasm"),
  ];
  for (const get of candidates) {
    try {
      const p = get();
      if (p && existsSync(p)) return p;
    } catch {
      /* try next */
    }
  }
  throw new Error("esbuild.wasm을 찾을 수 없습니다.");
}

async function loadWasmEsbuild(req: NodeRequire): Promise<EsbuildApi> {
  const esbuild = req("esbuild-wasm") as EsbuildWasmApi;
  if (!wasmInitialized) {
    const wasmPath = resolveWasmPath(req);
    const wasmModule = await WebAssembly.compile(readFileSync(wasmPath));
    await esbuild.initialize({ wasmModule, worker: false });
    wasmInitialized = true;
  }
  if (typeof esbuild.transform !== "function" || typeof esbuild.build !== "function") {
    throw new Error("esbuild-wasm API가 불완전합니다.");
  }
  await esbuild.transform("export {}", { loader: "js" });
  return esbuild;
}

async function loadNativeEsbuild(req: NodeRequire): Promise<EsbuildApi> {
  const esbuild = req("esbuild") as EsbuildApi;
  if (typeof esbuild.transform !== "function" || typeof esbuild.build !== "function") {
    throw new Error("native esbuild API가 불완전합니다.");
  }
  await esbuild.transform("export {}", { loader: "js" });
  return esbuild;
}

/**
 * Vercel/Lambda에서는 native esbuild 바이너리가 자주 깨져
 * `(void 0) is not a function`이 나므로 wasm을 우선 사용.
 */
async function loadEsbuild(): Promise<EsbuildApi> {
  if (cachedApi) return cachedApi;

  const req = nodeRequire();
  const onServerless = Boolean(
    process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL_ENV
  );

  const errors: string[] = [];

  if (onServerless) {
    try {
      cachedApi = await loadWasmEsbuild(req);
      return cachedApi;
    } catch (e) {
      errors.push(`wasm: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      cachedApi = await loadNativeEsbuild(req);
      return cachedApi;
    } catch (e) {
      errors.push(`native: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    try {
      cachedApi = await loadNativeEsbuild(req);
      return cachedApi;
    } catch (e) {
      errors.push(`native: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      cachedApi = await loadWasmEsbuild(req);
      return cachedApi;
    } catch (e) {
      errors.push(`wasm: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  throw new Error(`esbuild를 초기화하지 못했습니다. ${errors.join(" / ")}`);
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
 * ZIP 상대 모듈은 /virtual/<zipPath> 로 마운트해 ./consultation-button 등을 해석.
 */
export async function bundleLandingCode(input: BundleInput): Promise<BundleResult> {
  const esbuild = await loadEsbuild();
  const cwd = process.cwd();
  const req = nodeRequire();

  const pageImport = "./" + input.pageFile.replace(/\.(tsx|jsx|ts|js)$/i, "");
  const virtualFiles: Record<string, string> = {
    "/virtual/__entry__.js": `export { default } from ${JSON.stringify(pageImport)};\n`,
    "/virtual/__landing_image__.js": LANDING_IMAGE_SHIM,
    "/virtual/__landing_link__.js": LANDING_LINK_SHIM,
    "/virtual/__landing_crm_bridge__.js": LANDING_CRM_BRIDGE_SHIM,
  };

  for (const [rel, code] of Object.entries(input.sourceFiles)) {
    const key = rel.replace(/^\/+/, "");
    virtualFiles[`/virtual/${key}`] = code;
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

              if (args.path.startsWith("/virtual/")) {
                return { path: args.path, namespace: "virtual" };
              }

              if (
                (args.path.startsWith("./") || args.path.startsWith("../")) &&
                (args.namespace === "virtual" || args.importer.startsWith("/virtual/"))
              ) {
                const importerPath = args.importer.replace(/^virtual:/, "");
                const dir = pathPosix.dirname(importerPath);
                const resolved = pathPosix.normalize(pathPosix.join(dir, args.path));
                const candidates = [
                  resolved,
                  `${resolved}.tsx`,
                  `${resolved}.jsx`,
                  `${resolved}.ts`,
                  `${resolved}.js`,
                  `${resolved}/index.tsx`,
                  `${resolved}/index.jsx`,
                  `${resolved}/index.ts`,
                  `${resolved}/index.js`,
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

              if (!args.path.startsWith(".") && !args.path.startsWith("/")) {
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
                    path: req.resolve(args.path),
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
