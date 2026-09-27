"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";
import {
  retryUpload,
  uploadFile,
  type IngestActionResult,
} from "@/app/actions";
import {
  mergeRows,
  type Row,
  type RowStatus,
  type StoredDocumentRow,
} from "./upload-rows";

/**
 * The temporary upload panel (spec 0006, AC-13): a drop zone that is also a button, one Server
 * Action call per file with at most 3 at once, one row per file, and the audit headline. The
 * server renders the stored list; this keeps rows for files in flight and merges each answer.
 */

const MAX_PARALLEL_UPLOADS = 3;
const BYTES_PER_MB = 1_048_576;

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
      inFlight: false,
    };
  }
  const { code, message, documentId } = result.error;
  const status: RowStatus =
    code === "failed"
      ? "failed"
      : code === "in_progress"
        ? "in progress"
        : "refused";
  return { ...row, documentId, status, reason: message, inFlight: false };
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

  /** Runs one action for a row, merges its answer, then reloads the server list and headline. */
  const settle = async (
    key: string,
    action: () => Promise<IngestActionResult>,
  ): Promise<void> => {
    try {
      const result = await action();
      updateRow(key, (row) => answeredRow(row, result));
    } catch {
      updateRow(key, (row) => ({
        ...row,
        status: "failed",
        reason: "the request did not reach the server, try again",
        inFlight: false,
      }));
    }
    router.refresh();
  };

  const send = (key: string, file: File): Promise<void> => {
    const formData = new FormData();
    formData.append("file", file);
    return settle(key, () => uploadFile(formData));
  };

  const retry = (documentId: number, filename: string): void => {
    const key = newKey();
    const row: Row = {
      key,
      documentId,
      filename,
      kind: null,
      status: "in progress",
      reason: null,
      inFlight: true,
    };
    setLocal((rows) => [
      row,
      ...rows.filter((other) => other.documentId !== documentId),
    ]);
    void settle(key, () => retryUpload(documentId));
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
        inFlight: !tooLarge,
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
            {row.status === "failed" && row.documentId !== null && (
              <button
                type="button"
                onClick={() => {
                  if (row.documentId !== null)
                    retry(row.documentId, row.filename);
                }}
                aria-label={`Retry ${row.filename}`}
                className="ml-auto rounded-md border border-neutral-300 px-2 py-0.5 text-xs font-medium hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
              >
                Retry
              </button>
            )}
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
