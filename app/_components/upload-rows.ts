import type { ChipState } from "@/components/chip";

/**
 * The upload panel's row model (spec 0006, AC-13): the rows the server stores, the rows kept in
 * the browser for files in flight, and how the two lists merge. Pure, so it is unit tested.
 */

export type RowStatus =
  | "uploading"
  | "done"
  | "already ingested"
  | "in progress"
  | "failed"
  | "refused";

export type Row = {
  readonly key: string;
  readonly documentId: number | null;
  readonly filename: string;
  readonly kind: string | null;
  readonly status: RowStatus;
  readonly reason: string | null;
  /** Waiting on an action; wins over the server's row until it answers. */
  readonly inFlight: boolean;
};

export type StoredDocumentRow = {
  readonly id: number;
  readonly filename: string;
  readonly kind: string | null;
  readonly status: "queued" | "extracting" | "done" | "failed";
  readonly error: string | null;
};

export const storedRow = (doc: StoredDocumentRow): Row => ({
  key: `doc-${doc.id}`,
  documentId: doc.id,
  filename: doc.filename,
  kind: doc.kind,
  status:
    doc.status === "done"
      ? "done"
      : doc.status === "failed"
        ? "failed"
        : "in progress",
  reason: doc.error,
  inFlight: false,
});

/**
 * Local rows first (files in flight or refused), then the server's list, newest first. A server
 * row replaces the local one with the same document id, keeping the "already ingested" label,
 * except while a retry of it is in flight.
 */
export const mergeRows = (
  local: readonly Row[],
  stored: readonly StoredDocumentRow[],
): readonly Row[] => {
  const storedIds = new Set(stored.map((doc) => doc.id));
  // Local rows are newest first and a Map keeps the last entry per key, so reverse: the newest
  // row for a document wins (the same file uploaded twice on one page).
  const localById = new Map(
    [...local]
      .reverse()
      .flatMap((row) =>
        row.documentId === null ? [] : [[row.documentId, row] as const],
      ),
  );
  const pending = local.filter(
    (row) => row.documentId === null || !storedIds.has(row.documentId),
  );
  const fromServer = stored.map((doc) => {
    const server = storedRow(doc);
    const mine = localById.get(doc.id);
    if (mine?.inFlight) return mine;
    return mine?.status === "already ingested" && server.status === "done"
      ? { ...server, status: mine.status }
      : server;
  });
  return [...pending, ...fromServer];
};

export type RowChip = {
  readonly state: ChipState;
  readonly label: RowStatus;
  readonly spin: boolean;
};

const CHIP_STATE: Readonly<Record<RowStatus, ChipState>> = {
  done: "approved",
  "already ingested": "approved",
  uploading: "working",
  "in progress": "working",
  failed: "rejected",
  refused: "rejected",
};

/** A row status as a chip (spec 0007, AC-14): the chip look, keeping the status's own word. */
export const chipFor = (status: RowStatus): RowChip => ({
  state: CHIP_STATE[status],
  label: status,
  spin: status === "uploading",
});
