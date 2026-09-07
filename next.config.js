/** @type {import('next').NextConfig} */
const nextConfig = {
  // Native/binary packages used only in API routes — do not webpack-bundle
    experimental: {
    serverComponentsExternalPackages: ["esbuild", "esbuild-wasm", "jszip"],
    outputFileTracingIncludes: {
      "/api/admin/landings/deploy-zip": [
        "./node_modules/esbuild/**/*",
        "./node_modules/@esbuild/**/*",
        "./node_modules/esbuild-wasm/**/*",
        "./node_modules/jszip/**/*",
      ],
      // 트레이싱 경로 매칭 누락 대비
      "/api/admin/landings/*": [
        "./node_modules/esbuild-wasm/**/*",
        "./node_modules/esbuild/**/*",
        "./node_modules/@esbuild/**/*",
      ],
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push("esbuild", "esbuild-wasm", "jszip");
      }
    }
    return config;
  },
  async redirects() {
    return [
      { source: "/", destination: "/admin", permanent: false },
      { source: "/life-care", destination: "/no-clawback", permanent: true },
    ];
  },
};

module.exports = nextConfig;
