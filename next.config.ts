import type { NextConfig } from "next";

const DEFAULT_MAX_UPLOAD_MB = 10;
const BYTES_PER_MB = 1_048_576;
/** Room for the multipart boundaries and part headers around the file (spec 0006, AC-5). */
const MULTIPART_OVERHEAD_BYTES = 65_536;
// Config runs outside the app, so it reads the variable itself; lib/env.ts validates it at start.
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || DEFAULT_MAX_UPLOAD_MB);

const nextConfig: NextConfig = {
  // Small self contained server for the Docker image (spec 0001, Hosting).
  output: "standalone",
  // Native module: keep it out of the bundle and load it from node_modules.
  serverExternalPackages: ["better-sqlite3"],
  // Dev logs Server Action arguments by default; a rejection reason is analyst text, never logged.
  logging: { serverFunctions: false },
  experimental: {
    serverActions: {
      bodySizeLimit: maxUploadMb * BYTES_PER_MB + MULTIPART_OVERHEAD_BYTES,
    },
  },
};

export default nextConfig;
