"use client";

import { RotateCwIcon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";
import {
  retryUpload,
  uploadFile,
  type IngestActionResult,
} from "@/app/actions";
import { Chip } from "@/components/chip";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  chipFor,
  mergeRows,
  type Row,
  type RowStatus,
  type StoredDocumentRow,
} from "./upload-rows";

/**
 * The upload panel (spec 0006, AC-13; restyled by spec 0007, AC-14, wireframe 1d): a drop zone
 * with one Choose files button, one Server Action call per file with at most 3 at once, one row
 * per file with its status chip, and the audit headline. The server renders the stored list;
 * this keeps rows for files in flight and merges each answer.
 */

const MAX_PARALLEL_UPLOADS = 3;
const BYTES_PER_MB = 1_048_576;

/** The latest run's figures (`latestHeadline`), or null before the first run. */
export type PanelHeadline = {
  readonly findingCount: number;
  readonly recoverableCents: number;
  readonly invoicedTotalCents: number;
  readonly recoverableShare: string;
};

type UploadPanelProps = {
  readonly documents: readonly StoredDocumentRow[];
  readonly headline: PanelHeadline | null;
  readonly maxUploadMb: number;
};

const KIND_LABEL: Readonly<Record<string, string>> = {
  invoice: "Invoice",
  contract: "Contract",
  purchase_order: "Purchase order",
  receipts_csv: "Receipts CSV",
  payments_csv: "Payments CSV",
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
    <section aria-labelledby="upload-heading" className="flex flex-col gap-6">
      <h2 id="upload-heading" className="sr-only">
        Upload documents
      </h2>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        data-dragging={dragging || undefined}
        className={cn(
          "flex flex-col items-center gap-3 rounded-md border border-dashed border-outline bg-neutral px-8 py-10 text-center text-on-surface-muted",
          "transition-colors duration-(--duration-quick) ease-out",
          "data-dragging:border-solid data-dragging:border-primary-deeper data-dragging:bg-secondary data-dragging:text-primary-deeper",
        )}
      >
        <UploadIcon aria-hidden="true" className="size-5" strokeWidth={1.5} />
        <p>Drop invoices, contracts, purchase orders and the two CSVs here.</p>
        <Button onClick={() => inputRef.current?.click()}>Choose files</Button>
        <p className="type-caption">PDF or CSV, up to {maxUploadMb} MB each.</p>
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

      <div className="flex flex-col">
        <div className="flex h-8 items-center justify-between border-b border-border type-label-caps text-on-surface-muted">
          <span>Files</span>
          <span className="type-data-md">{rows.length}</span>
        </div>
        {rows.length === 0 ? (
          <p className="py-6 text-on-surface-muted">
            No documents yet. Drop files above, or press Load sample data in the
            bar to fill the audit with the fictional sample.
          </p>
        ) : (
          <ul aria-live="polite">
            {rows.map((row) => (
              <FileRow key={row.key} row={row} onRetry={retry} />
            ))}
          </ul>
        )}
      </div>

      <p className="type-headline-sm" aria-live="polite">
        <HeadlineLine headline={headline} />
      </p>
    </section>
  );
}

type FileRowProps = {
  readonly row: Row;
  readonly onRetry: (documentId: number, filename: string) => void;
};

function FileRow({ row, onRetry }: FileRowProps) {
  const chip = chipFor(row.status);
  const { documentId } = row;
  return (
    <li className="flex min-h-row-height flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-1.5">
      <span className="type-data-md break-all text-on-surface">
        {row.filename}
      </span>
      {row.kind && (
        <span className="text-on-surface-muted">
          {KIND_LABEL[row.kind] ?? row.kind}
        </span>
      )}
      <span className="ml-auto flex items-center gap-2">
        {row.status === "failed" && documentId !== null && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onRetry(documentId, row.filename)}
            aria-label={`Retry ${row.filename}`}
          >
            <RotateCwIcon aria-hidden="true" />
            Retry
          </Button>
        )}
        <Chip state={chip.state} label={chip.label} spin={chip.spin} />
      </span>
      {row.reason && (
        <span className="w-full type-caption text-error">{row.reason}</span>
      )}
    </li>
  );
}

/** "8 findings, $9,766.85 recoverable of $53,939.60 invoiced (18.1%)", amounts in `Money`. */
function HeadlineLine({
  headline,
}: {
  readonly headline: PanelHeadline | null;
}) {
  if (headline === null) return <>No audit yet</>;
  const findings = headline.findingCount === 1 ? "finding" : "findings";
  return (
    <>
      {headline.findingCount} {findings},{" "}
      <Money cents={headline.recoverableCents} strong /> recoverable of{" "}
      <Money cents={headline.invoicedTotalCents} strong /> invoiced (
      <span className="type-data-md-strong">{headline.recoverableShare}</span>)
    </>
  );
}
