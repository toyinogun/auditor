import type { NextConfig } from "next";

const DEFAULT_MAX_UPLOAD_MB = 10;
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB ?? DEFAULT_MAX_UPLOAD_MB);

const nextConfig: NextConfig = {
  // Small self contained server for the Docker image (spec 0001, Hosting).
  output: "standalone",
  // Native module: keep it out of the bundle and load it from node_modules.
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    serverActions: {
      bodySizeLimit: `${maxUploadMb}mb`,
    },
  },
};

export default nextConfig;
