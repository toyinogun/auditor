import { connection } from "next/server";
import { headlineText, latestHeadline } from "@/lib/audit/headline";
import { getDb } from "@/lib/db/client";
import { listDocuments } from "@/lib/db/documents";
import { env } from "@/lib/env";
import { UploadPanel } from "./_components/upload-panel";

export default async function Home() {
  // better-sqlite3 is synchronous: wait for a request so the list is never prerendered.
  await connection();
  const db = getDb();
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Overpayment Auditor</h1>
      <p className="mt-2 text-neutral-600">
        Upload supplier documents and the auditor checks every invoice against
        its contract, the goods received and the payments made.
      </p>
      <UploadPanel
        documents={listDocuments(db)}
        headline={headlineText(latestHeadline(db))}
        maxUploadMb={env.MAX_UPLOAD_MB}
      />
    </main>
  );
}
