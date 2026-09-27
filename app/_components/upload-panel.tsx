"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";
import { uploadFile, type IngestActionResult } from "@/app/actions";

/**
 * The temporary upload panel (spec 0006, AC-13): a drop zone that is also a button, one Server
 * Action call per file with at most 3 at once, one row per file, and the audit headline. The
 * server renders the stored list; this keeps rows for files in flight and merges each answer.
 */

const MAX_PARALLEL_UPLOADS = 3;
const BYTES_PER_MB = 1_048_576;

type RowStatus =
  | "uploading"
  | "done"
  | "already ingested"
  | "in progress"
  | "failed"
  | "refused";

type Row = {
  readonly key: string;
  readonly documentId: number | null;
  readonly filename: string;
  readonly kind: string | null;
  readonly status: RowStatus;
  readonly reason: string | null;
};

export type StoredDocumentRow = {
  readonly id: number;
  readonly filename: string;
  readonly kind: string | null;
  readonly status: "queued" | "extracting" | "done" | "failed";
  readonly error: string | null;
};

type UploadPanelProps = {
  readonly documents: readonly StoredDocumentRow[];
  readonly headline: string;
  readonly maxUploadMb: number;
};

const KIND_LABEL: Readonly<Record<string, string>> = {
  invoice: "Invoice",
  contract: "Contract",
  purchase_order: "Purchase order",
  receipts_csv: "Receipts CSV",
  payments_csv: "Payments CSV",
};

const STATUS_STYLE: Readonly<Record<RowStatus, string>> = {
  uploading: "bg-neutral-100 text-neutral-700",
  done: "bg-emerald-100 text-emerald-800",
  "already ingested": "bg-sky-100 text-sky-800",
  "in progress": "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-800",
  refused: "bg-red-100 text-red-800",
};

const storedRow = (doc: StoredDocumentRow): Row => ({
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
});

/** The row a file shows once its action answers. */
const answeredRow = (row: Row, result: IngestActionResult): Row => {
  if (result.ok) {
    const { documentId, kind, alreadyIngested } = result.value;
    return {
      ...row,
      documentId,
      kind,
      status: alreadyIngested ? "already ingested" : "done",
      reason: null,
    };
  }
  const { code, message, documentId } = result.error;
  const status: RowStatus =
    code === "failed"
      ? "failed"
      : code === "in_progress"
        ? "in progress"
        : "refused";
  return { ...row, documentId, status, reason: message };
};

/**
 * Local rows first (files in flight or refused), then the server's list, newest first. A server
 * row replaces the local one with the same document id, keeping the "already ingested" label.
 */
const mergeRows = (
  local: readonly Row[],
  stored: readonly StoredDocumentRow[],
): readonly Row[] => {
  const storedIds = new Set(stored.map((doc) => doc.id));
  const localById = new Map(
    local.flatMap((row) =>
      row.documentId === null ? [] : [[row.documentId, row] as const],
    ),
  );
  const pending = local.filter(
    (row) => row.documentId === null || !storedIds.has(row.documentId),
  );
  const fromServer = stored.map((doc) => {
    const server = storedRow(doc);
    const mine = localById.get(doc.id);
    return mine?.status === "already ingested" && server.status === "done"
      ? { ...server, status: mine.status }
      : server;
  });
  return [...pending, ...fromServer];
};

/** Runs `task` over `items`, at most `limit` at once. */
const runPool = async <T,>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> => {
  const queue = [...items];
  const worker = async (): Promise<void> => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      await task(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
};

const newKey = (): string => crypto.randomUUID();

export function UploadPanel({
  documents,
  headline,
  maxUploadMb,
}: UploadPanelProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [local, setLocal] = useState<readonly Row[]>([]);
  const [dragging, setDragging] = useState(false);

  const updateRow = (key: string, next: (row: Row) => Row): void =>
    setLocal((rows) => rows.map((row) => (row.key === key ? next(row) : row)));

  const send = async (key: string, file: File): Promise<void> => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const result = await uploadFile(formData);
      updateRow(key, (row) => answeredRow(row, result));
    } catch {
      updateRow(key, (row) => ({
        ...row,
        status: "failed",
        reason: "the upload did not reach the server, try again",
      }));
    }
    router.refresh();
  };

  const addFiles = (files: readonly File[]): void => {
    const maxBytes = maxUploadMb * BYTES_PER_MB;
    const entries = files.map((file) => ({ key: newKey(), file }));
    const rows = entries.map(({ key, file }): Row => {
      const tooLarge = file.size > maxBytes;
      return {
        key,
        documentId: null,
        filename: file.name,
        kind: null,
        status: tooLarge ? "refused" : "uploading",
        reason: tooLarge ? `the file is larger than ${maxUploadMb} MB` : null,
      };
    });
    setLocal((current) => [...rows, ...current]);
    const toSend = entries.filter(({ file }) => file.size <= maxBytes);
    void runPool(toSend, MAX_PARALLEL_UPLOADS, ({ key, file }) =>
      send(key, file),
    );
  };

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragging(false);
    addFiles([...event.dataTransfer.files]);
  };

  const rows = mergeRows(local, documents);

  return (
    <section aria-labelledby="upload-heading" className="mt-8">
      <h2 id="upload-heading" className="text-lg font-semibold">
        Upload documents
      </h2>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`mt-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? "border-sky-500 bg-sky-50" : "border-neutral-300"
        }`}
      >
        <p className="text-neutral-600">
          Drop invoices, contracts, purchase orders and the two CSVs here.
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-3 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Choose files
        </button>
        <p className="mt-2 text-xs text-neutral-500">
          PDF or CSV, up to {maxUploadMb} MB each.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.csv"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            addFiles([...(event.target.files ?? [])]);
            event.target.value = "";
          }}
        />
      </div>

      <ul aria-live="polite" className="mt-4 divide-y divide-neutral-200">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
          >
            <span className="font-medium break-all">{row.filename}</span>
            {row.kind && (
              <span className="text-sm text-neutral-500">
                {KIND_LABEL[row.kind] ?? row.kind}
              </span>
            )}
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[row.status]}`}
            >
              {row.status}
            </span>
            {row.reason && (
              <span className="w-full text-sm text-red-700">{row.reason}</span>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-4 font-medium" aria-live="polite">
        {headline}
      </p>
    </section>
  );
}
