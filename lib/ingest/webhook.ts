import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { Db } from "@/lib/db/client";
import { logEvent } from "@/lib/log";
import { BYTES_PER_MB } from "./detect";
import {
  ingestFile,
  type IngestDeps,
  type IngestErrorCode,
  type IngestOutcome,
} from "./ingest";

/**
 * `POST /api/ingest` for n8n (spec 0006, AC-3, AC-5, AC-6): the guards only HTTP needs, in
 * order, then the same `ingestFile` the browser uses. Config comes in as a value so the route
 * stays one line and every guard is tested without the environment.
 */

export type WebhookConfig = {
  readonly demoMode: boolean;
  /** Unset turns the webhook off. */
  readonly secret: string | undefined;
  readonly db: () => Db;
  readonly deps: () => IngestDeps;
  readonly clock: () => number;
};

export const SECRET_HEADER = "x-ingest-secret";

/** Room for the multipart boundaries and part headers around the file (AC-5). */
export const MULTIPART_OVERHEAD_BYTES = 65_536;

const NO_FILE = "send one file in a multipart field named file";

export type WebhookBody =
  | { readonly ok: true; readonly value: IngestOutcome }
  | {
      readonly ok: false;
      readonly error: string;
      readonly documentId: number | null;
    };

const STATUS_BY_CODE: Readonly<Record<IngestErrorCode, number>> = {
  unsupported: 415,
  too_large: 413,
  empty: 400,
  no_file: 400,
  demo_refused: 503,
  in_progress: 409,
  not_failed: 409,
  failed: 422,
};

const answer = (status: number, body: WebhookBody): Response =>
  Response.json(body, { status });

const refusal = (
  status: number,
  error: string,
  documentId: number | null = null,
): Response => answer(status, { ok: false, error, documentId });

const digest = (value: string): Buffer =>
  createHash("sha256").update(value).digest();

/** Both sides hashed first so the lengths match, then compared in constant time (AC-6). */
const secretMatches = (given: string | null, expected: string): boolean =>
  given !== null && timingSafeEqual(digest(given), digest(expected));

const tooLarge = (maxUploadBytes: number): string =>
  `the file is larger than ${maxUploadBytes / BYTES_PER_MB} MB`;

/** A whole number of bytes, or null when the header is missing or not a number. */
const contentLengthOf = (request: Request): number | null => {
  const header = request.headers.get("content-length");
  if (header === null || !/^\d+$/.test(header.trim())) return null;
  return Number(header.trim());
};

/**
 * Reads the body, counting bytes as they stream in, and stops once the count passes `limit`,
 * so a wrong `Content-Length` can never make it buffer more (AC-5). Null means too large.
 */
const readLimited = async (
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<Uint8Array<ArrayBuffer> | null> => {
  if (body === null) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
};

/** The one `file` part of a multipart body, or null when there is none or the body is broken. */
const filePart = async (
  bytes: Uint8Array<ArrayBuffer>,
  contentType: string,
): Promise<File | null> => {
  try {
    const form = await new Response(bytes, {
      headers: { "content-type": contentType },
    }).formData();
    const file = form.get("file");
    return file instanceof File ? file : null;
  } catch {
    return null;
  }
};

type Guarded =
  | { readonly ok: true; readonly file: File; readonly deps: IngestDeps }
  | {
      readonly ok: false;
      readonly response: Response;
      readonly outcome: string;
    };

const stop = (outcome: string, response: Response): Guarded => ({
  ok: false,
  outcome,
  response,
});

/** AC-6 then AC-5, in order; the body is read only once the caller is authorized. */
const guard = async (
  request: Request,
  config: WebhookConfig,
): Promise<Guarded> => {
  if (config.demoMode) {
    return stop("demo", refusal(503, "intake is disabled on the demo"));
  }
  if (config.secret === undefined) {
    return stop("not_configured", refusal(503, "intake is not configured"));
  }
  if (!secretMatches(request.headers.get(SECRET_HEADER), config.secret)) {
    return stop("unauthorized", refusal(401, "unauthorized"));
  }
  const deps = config.deps();
  const limit = deps.maxUploadBytes + MULTIPART_OVERHEAD_BYTES;
  const declared = contentLengthOf(request);
  if (declared === null) {
    return stop("no_length", refusal(411, "send a Content-Length header"));
  }
  if (declared > limit) {
    return stop("too_large", refusal(413, tooLarge(deps.maxUploadBytes)));
  }
  const bytes = await readLimited(request.body, limit);
  if (bytes === null) {
    return stop("too_large", refusal(413, tooLarge(deps.maxUploadBytes)));
  }
  const file = await filePart(bytes, request.headers.get("content-type") ?? "");
  if (file === null) return stop("no_file", refusal(400, NO_FILE));
  return { ok: true, file, deps };
};

export const handleIngestRequest = async (
  request: Request,
  config: WebhookConfig,
): Promise<Response> => {
  const startedAt = config.clock();
  const guarded = await guard(request, config);
  if (!guarded.ok) {
    // AC-16: a refused call logs only its source, outcome and time.
    logEvent({
      event: "ingest",
      source: "webhook",
      outcome: guarded.outcome,
      ms: config.clock() - startedAt,
    });
    return guarded.response;
  }
  const result = await ingestFile(
    config.db(),
    {
      filename: guarded.file.name,
      bytes: new Uint8Array(await guarded.file.arrayBuffer()),
      source: "webhook",
    },
    guarded.deps,
  );
  if (result.ok) return answer(200, { ok: true, value: result.value });
  const { code, message, documentId } = result.error;
  return refusal(STATUS_BY_CODE[code], message, documentId);
};
