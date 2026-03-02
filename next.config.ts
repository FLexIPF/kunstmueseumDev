import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Avoid Next guessing a wrong monorepo root when multiple lockfiles exist.
  outputFileTracingRoot: __dirname,
  images: {
    // We mostly serve local images from /public/artworks/... but keep remote disabled by default.
    remotePatterns: [],
  },
};

export default nextConfig;
