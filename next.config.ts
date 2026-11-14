import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for the Cloud Run Dockerfile (B, see DEPLOY.md).
  output: "standalone",
};

export default nextConfig;
