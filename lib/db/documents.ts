import "server-only";
import { eq } from "drizzle-orm";
import type {
  DocumentKind,
  DocumentSource,
  DocumentStatus,
} from "@/lib/schemas/enums";
import { err, ok, type Result } from "@/lib/schemas/result";
import type { Db } from "./client";
import { documents } from "./schema";

export type StoredDocument = typeof documents.$inferSelect;

/** What the caller knows about a file before extraction (Feature 8 or the sample loader). */
export type NewDocument = {
  readonly sha256: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly source: DocumentSource;
  readonly kind?: DocumentKind | null;
};

export type InsertedDocument = {
  readonly document: StoredDocument;
  /** True when a file with the same bytes was already stored; no row was added. */
  readonly alreadyIngested: boolean;
};

/** Stores a new document as `queued`, or returns the existing one with the same `sha256`. */
export const insertDocument = (
  db: Db,
  doc: NewDocument,
  now: number = Date.now(),
): InsertedDocument =>
  db.transaction((tx) => {
    const existing = tx
      .select()
      .from(documents)
      .where(eq(documents.sha256, doc.sha256))
      .get();
    if (existing) return { document: existing, alreadyIngested: true };
    const document = tx
      .insert(documents)
      .values({
        ...doc,
        kind: doc.kind ?? null,
        status: "queued",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return { document, alreadyIngested: false };
  });

export type DocumentStatusUpdate = {
  readonly status: DocumentStatus;
  readonly error?: string | null;
  readonly kind?: DocumentKind;
  /** Set by extraction (Feature 7); left unchanged when omitted. */
  readonly hasTextLayer?: boolean | null;
};

/** Moves a document along queued → extracting → done | failed. Clears the error unless one is given. */
export const setDocumentStatus = (
  db: Db,
  id: number,
  update: DocumentStatusUpdate,
  now: number = Date.now(),
): Result<StoredDocument> => {
  const updated = db
    .update(documents)
    .set({
      status: update.status,
      error: update.error ?? null,
      updatedAt: now,
      ...(update.kind !== undefined && { kind: update.kind }),
      ...(update.hasTextLayer !== undefined && {
        hasTextLayer: update.hasTextLayer,
      }),
    })
    .where(eq(documents.id, id))
    .returning()
    .get();
  return updated ? ok(updated) : err(`document ${id} does not exist`);
};
