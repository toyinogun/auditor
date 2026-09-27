import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import type { ExtractDeps } from "./extract";

/** Per request timeout and the SDK's own retries for 429, 5xx and connection errors. */
const TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;

/**
 * The only place that constructs the Anthropic client (spec 0005). With no key it still returns
 * deps, with `apiKeySet: false`, so `extractDocument` fails with a clear reason before any call.
 */
export const createModelClient = (): ExtractDeps => {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (apiKey === undefined) {
    return {
      apiKeySet: false,
      now: Date.now,
      createMessage: () =>
        Promise.reject(new Error("createMessage called with no API key")),
    };
  }
  const client = new Anthropic({
    apiKey,
    timeout: TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
  });
  return {
    apiKeySet: true,
    now: Date.now,
    createMessage: (params) => client.messages.create(params),
  };
};
