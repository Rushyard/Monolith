import type { NextConfig } from "next";

// In-browser UltraHonk proving (bb.js) needs SharedArrayBuffer, hence
// cross-origin isolation. `credentialless` (not `require-corp`) still lets
// fetch() reach the Soroban RPC without CORP headers on that endpoint.
const crossOriginIsolation = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
];

const nextConfig: NextConfig = {
  transpilePackages: ["stellar-confidential-token-sdk"],
  async headers() {
    return [{ source: "/(.*)", headers: crossOriginIsolation }];
  },
  webpack: (config, { isServer }) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true, topLevelAwait: true };
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, crypto: false };
    // Never bundle bb.js on the client: it is loaded as native ESM from
    // /vendor/bb (see lib/ct/bb-loader.ts and scripts/vendor-bb.mjs).
    if (!isServer) {
      config.resolve.alias = { ...config.resolve.alias, "@aztec/bb.js": false };
    }
    return config;
  },
};

export default nextConfig;
