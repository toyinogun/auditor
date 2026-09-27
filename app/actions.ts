"use server";

import { revalidatePath } from "next/cache";
import {
  loadSampleData as loadSampleIntoDb,
  type SampleLoaded,
} from "@/lib/audit/sample";
import { getDb } from "@/lib/db/client";
import { ingestDeps, uploadStore } from "@/lib/ingest/deps";
import {
  ingestFile,
  retryDocument,
  type IngestError,
  type IngestOutcome,
} from "@/lib/ingest/ingest";
import { err, type Result } from "@/lib/schemas/result";

/**
 * Server Actions. The upload panel's (spec 0006) only turn the form into bytes; every check,
 * including the demo gate, lives in `ingestFile`. Load sample data is spec 0007's.
 */

/**
 * Rerenders every page and the app bar's decision count (spec 0007, AC-12). Every action that
 * changes runs or decisions calls it, so the reload guard's count is never stale.
 */
export const revalidateAudit = async (): Promise<void> => {
  revalidatePath("/", "layout");
};

/**
 * The app bar's Load sample data (spec 0007, AC-12): replays the committed sample with no model
 * call, in demo mode or not. Empties the uploads folder through the upload store only.
 */
export const loadSampleData = async (): Promise<Result<SampleLoaded>> => {
  const result = await loadSampleIntoDb(getDb(), uploadStore());
  if (result.ok) await revalidateAudit();
  return result;
};

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
