import type { Metadata } from "next";
import { connection } from "next/server";
import { UploadPanel } from "@/app/_components/upload-panel";
import { latestHeadline } from "@/lib/audit/headline";
import { getDb } from "@/lib/db/client";
import { listDocuments } from "@/lib/db/documents";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Documents" };

/** Intake (spec 0006; restyled by spec 0007, AC-14): capped at 880px and left aligned. */
export default async function DocumentsPage() {
  // better-sqlite3 is synchronous: wait for a request so the list is never prerendered.
  await connection();
  const db = getDb();
  return (
    <div className="flex max-w-220 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="type-headline-lg">Documents</h1>
        <p className="max-w-measure text-on-surface-muted">
          The auditor checks every invoice against its contract, the goods
          received and the payments made.
        </p>
      </div>
      <UploadPanel
        documents={listDocuments(db)}
        headline={latestHeadline(db)}
        maxUploadMb={env.MAX_UPLOAD_MB}
      />
    </div>
  );
}
