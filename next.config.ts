import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for the Cloud Run Dockerfile (B, see DEPLOY.md).
  output: "standalone",
  // Dev server only: let a phone on the same Wi-Fi or hotspot load the app from
  // the laptop's address (Next blocks other devices by default). Private
  // address ranges, plus anything in DEV_ORIGINS (comma-separated).
  allowedDevOrigins: [
    "192.168.*.*",
    "10.*.*.*",
    "172.*.*.*",
    "*.local",
    ...(process.env.DEV_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  ],
};

export default nextConfig;
