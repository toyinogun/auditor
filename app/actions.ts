"use server";

import { getDb } from "@/lib/db/client";
import { ingestDeps } from "@/lib/ingest/deps";
import {
  ingestFile,
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
