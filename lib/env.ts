import { z } from "zod";

/**
 * The only place that reads `process.env` (AGENTS.md). Each feature adds the variables it
 * uses (spec 0001, Configuration); a bad value fails at startup, not partway through a request.
 */
const EnvSchema = z.object({
  /** Folder that holds `auditor.db`: `./data` locally, `/data` on k3s. */
  DATA_DIR: z.string().min(1).default("./data"),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse({
  DATA_DIR: process.env.DATA_DIR || undefined,
});
