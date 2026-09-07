import { createRequire } from "module";
import path from "path";
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

type Esbuild = typeof import("esbuild");

async function loadEsbuild(): Promise<Esbuild> {
  // Next/webpack이 esbuild 타입정의(.d.ts)를 파싱하지 않도록 런타임 로드
  const req = createRequire(path.resolve(process.cwd(), "package.json"));
  return req("esbuild") as Esbuild;
}

/**
 * React/Next 랜딩 소스를 호스트 React와 공유하는 CJS 번들로 빌드.
 * lucide-react 등은 cwd node_modules에서 번들, react는 external.
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

  const result = await esbuild.build({
    absWorkingDir: cwd,
    entryPoints: ["/virtual/__entry__.js"],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "browser",
    target: ["es2019"],
    jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    logLevel: "silent",
    plugins: [
      {
        name: "virtual-fs",
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
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
            }

            // bare imports like lucide-react → node_modules
            if (!args.path.startsWith(".") && !args.path.startsWith("/")) {
              try {
                return {
                  path: nodeRequire.resolve(args.path),
                  namespace: "file",
                };
              } catch {
                return undefined;
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

  const js = result.outputFiles?.[0]?.text;
  if (!js) throw new Error("번들 결과가 비어 있습니다.");

  return {
    js,
    warnings: (result.warnings || []).map((w: { text: string }) => w.text),
  };
}
