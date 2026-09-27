import { z } from "zod";

/**
 * The only place that reads `process.env` (AGENTS.md). Each feature adds the variables it
 * uses (spec 0001, Configuration); a bad value fails at startup, not partway through a request.
 */
const EnvSchema = z.object({
  /** Folder that holds `auditor.db`: `./data` locally, `/data` on k3s. */
  DATA_DIR: z.string().min(1).default("./data"),
  /** Claude access, server only. Optional: the offline sample and the public demo need none (spec 0005). */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  /** Extraction model id (spec 0005). A model without forced tool choice needs that spec revisited. */
  ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-5"),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse({
  DATA_DIR: process.env.DATA_DIR || undefined,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || undefined,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || undefined,
});
