import { connection } from "next/server";
import { AppBar } from "@/components/app-bar";
import { countDecisions, latestAuditRun } from "@/lib/db/audit";
import { getDb } from "@/lib/db/client";

/**
 * The working app's shell (spec 0007, AC-10): app bar, then the page in a frame capped at
 * 1440px with 32px side margins. Reads the decision count per request for the reload guard,
 * and whether a run exists for Export (spec 0009, AC-2).
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  await connection();
  const db = getDb();
  const decisionCount = countDecisions(db);
  const canExport = latestAuditRun(db) !== null;
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-surface focus:px-3 focus:py-2 focus:type-label-md"
      >
        Skip to content
      </a>
      <AppBar decisionCount={decisionCount} canExport={canExport} />
      <main id="main" className="mx-auto w-full max-w-app px-page pt-8 pb-20">
        {children}
      </main>
    </>
  );
}
