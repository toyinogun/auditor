"use server";

import { getDb } from "@/lib/db/client";
import { ingestDeps } from "@/lib/ingest/deps";
import {
  ingestFile,
  retryDocument,
  type IngestError,
  type IngestOutcome,
} from "@/lib/ingest/ingest";
import { err, type Result } from "@/lib/schemas/result";

/**
 * The upload panel's Server Actions (spec 0006). They only turn the form into bytes; every
 * check, including the demo gate, lives in `ingestFile`.
 */

export type IngestActionResult = Result<IngestOutcome, IngestError>;

export const uploadFile = async (
  formData: FormData,
): Promise<IngestActionResult> => {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return err({
      code: "no_file",
      message: "send one file in a multipart field named file",
      documentId: null,
    });
  }
  return ingestFile(
    getDb(),
    {
      filename: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      source: "upload",
    },
    ingestDeps(),
  );
};

/** Retry on a failed row: ingest again from the saved file (spec 0006, AC-10). */
export const retryUpload = async (
  documentId: number,
): Promise<IngestActionResult> => {
  if (!Number.isSafeInteger(documentId) || documentId < 1) {
    return err({
      code: "not_failed",
      message: "not a document id",
      documentId: null,
    });
  }
  return retryDocument(getDb(), documentId, ingestDeps());
};
