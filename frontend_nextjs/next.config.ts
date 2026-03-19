import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable StrictMode — double-mount breaks Three.js SkinnedMesh materials
  // (R3F re-creates the JSX Group on remount while the cached GLTF scene is
  // reparented, leaving bone matrices and material state stale)
  reactStrictMode: false,
  reactCompiler: true,
  output: "standalone",
  transpilePackages: ["@google/genai"],
};

export default nextConfig;
