import { z } from "zod";

/**
 * The only place that reads `process.env` (AGENTS.md). Each feature adds the variables it
 * uses (spec 0001, Configuration); a bad value fails at startup, not partway through a request.
 */

/** Shortest webhook secret accepted (spec 0006, AC-15): `openssl rand -hex 32` gives 64. */
export const MIN_INGEST_SECRET_LENGTH = 32;

export const EnvSchema = z.object({
  /** Folder that holds `auditor.db` and `uploads/`: `./data` locally, `/data` on k3s. */
  DATA_DIR: z.string().min(1).default("./data"),
  /** Claude access, server only. Optional: the offline sample and the public demo need none (spec 0005). */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  /** Extraction model id (spec 0005). A model without forced tool choice needs that spec revisited. */
  ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-5"),
  /** Shared secret n8n sends in `X-Ingest-Secret`. Unset turns the webhook off (spec 0006). */
  INGEST_SECRET: z.string().min(MIN_INGEST_SECRET_LENGTH).optional(),
  /** The public demo: only the sample files, never a model call, no webhook (spec 0006). */
  DEMO_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  /** Per file upload limit in megabytes (spec 0006, AC-5). */
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(50).default(10),
});

export type Env = z.infer<typeof EnvSchema>;

type EnvSource = Readonly<Record<string, string | undefined>>;

/** Parses the variables this app reads; an empty string counts as unset. Throws on a bad value. */
export const readEnv = (source: EnvSource): Env =>
  EnvSchema.parse(
    Object.fromEntries(
      Object.keys(EnvSchema.shape).map((key) => [
        key,
        source[key] || undefined,
      ]),
    ),
  );

export const env: Env = readEnv(process.env);
