# 0006. Upload and ingest: decision record

The reasoning behind [index.md](index.md). `/develop` does not need this file.

## Context

Release 2 can now read a PDF with Claude (spec 0005) and parse the two CSVs, but only from the command line over the committed sample. Nothing yet lets a person or a machine hand the app a new file. The brief asks for two intake paths, a browser upload and an n8n workflow watching Google Drive, and spec 0001 already fixed their transport: a Server Action for the browser, `POST /api/ingest` with a shared secret header for n8n, files on local disk named by hash, and no queue.

What is still open is everything between receiving bytes and a finished audit. Which bytes count as a PDF or a CSV, and which CSV. What a second copy of a file does, including one that arrives while the first is still being read. What happens to a file the model rejects or misreads, and how it gets another try, including after a pod restart mid extraction (a follow up spec 0001 left for this feature). When the audit reruns. And above all, how the public demo stays free and safe: visitors must be able to try intake with no key, yet no outside document may reach the model or the disk.

The forces are small volume (a dozen documents, a few seconds each), one replica on SQLite, a 2 to 3 evening time box, and a public URL with no logins. Getting the demo gate wrong costs real money and puts unknown documents on the volume. Getting dedupe or retry wrong leaves files stuck or doubles the model bill. Getting the two paths to diverge means n8n and the browser disagree about the same file.

## Options considered

### Option 1: One `ingestFile` function, synchronous in the request (chosen)

Both edges turn their input into `{ filename, bytes, source }` and call one function in `lib/ingest/` that checks, stores, extracts, saves and reruns the audit, then answers with the outcome.

**Pros**:
- One set of rules and one test suite for both paths.
- The caller learns the real outcome, so n8n's run log and the browser row both show success or the reason.
- No new moving parts: fits spec 0001's no queue decision.

**Cons**:
- Requests take as long as extraction, up to about 20 seconds for a scan.
- A restart mid request loses the work in flight (handled by the restart sweep and Retry, not avoided).

### Option 2: Store now, extract after the response

Save the file and the `queued` row, answer at once (`202`), and extract after the response with `after()` or a fire and forget promise.

**Pros**:
- Fast answers for n8n and the browser.
- Uploading many files feels quicker.

**Cons**:
- Work after the response dies silently on restart, and nobody is told.
- n8n never sees a failure; the browser needs polling to learn the outcome.
- Two code paths (accept, then work) where one would do.

### Option 3: Separate handlers per path

The Server Action and the route each implement their own flow, sharing only small helpers.

**Pros**:
- Each path can be tuned to its caller (streaming progress to the browser, for example).

**Cons**:
- The rules for demo, dedupe and retry drift apart over time; the same file can behave differently depending on how it arrived.
- Twice the tests for the same behavior.

## Rationale

Option 1 fits the actual volume and the time box. At a dozen documents, waiting a few seconds in the request is cheaper than any machinery to avoid it, and it is the only option where both callers learn the real outcome without polling. Its main risk, a restart mid extraction, is handled by making the stuck state visible and recoverable (the sweep plus Retry) instead of trying to guarantee completion, which would need the queue spec 0001 ruled out.

Putting the demo gate inside `ingestFile`, not only at the edges, is deliberate: it is the one rule whose failure costs money, so it lives where every path passes. The claim (the move to `extracting`) is one conditional SQL update rather than a read followed by a write, so "at most one extraction per document" holds without locks and survives a later change that adds an `await` in between. CSVs use the same claim, which is why they now pass briefly through `extracting` (the cross check found that without it a CSV retry had no guard).

Keeping failed documents, rather than deleting them, costs a row and a file each, but it means nothing disappears silently and Retry needs no original. Rerunning the audit after every file costs milliseconds at this size and keeps the headline honest whichever path the file came by; the cost is that findings flicker while a batch arrives, which the analyst sees only if they review mid upload.

### Calls made while writing (the engineer did not weigh in)

- **Write the file before the row.** A crash between the two leaves an orphan file the next upload reuses, instead of a row with no file. Runner up: row first, then file.
- **No new status for the webhook's in flight answer.** `409` with `already being processed` tells n8n to try later. Runner up: `202`, which n8n would treat as success.
- **`422` for a stored but failed document.** n8n marks it failed and shows the reason. Runner up: `200` with `status: failed`, which n8n would count as success.
- **Plain Tailwind for the panel, no shadcn setup.** Feature 9 initializes shadcn and the tokens; setting it up here would be redone. Runner up: add `button` and `badge` now.
- **`app/_components/` for the panel.** A private folder next to the page it serves; `components/ui/` stays shadcn only. Runner up: `components/upload-panel.tsx`.
- **`INGEST_SECRET` at least 32 characters.** Stops a weak secret on a URL that will be public. Runner up: any non empty value.
- **`MAX_UPLOAD_MB` capped at 50.** A single replica holds the whole body in memory; 50 MB is far beyond any invoice. Runner up: no cap.
- **Document list capped at 200.** Bounded even on a busy private server; the demo holds at most 14. Runner up: no cap.
- **`loadSample` wrapper instead of clearing inside `runSampleAudit`.** Tests of `runSampleAudit` run on in memory databases and must never touch a real folder; the wrapper takes the upload store as a parameter. Runner up: an `afterCommit` hook.

### Answers from the design conversation

- Demo uploads: sample hashes only, fixture records, no model call.
- Upload UI: a plain panel on the home page now; Feature 10 restyles it.
- A second CSV of the same kind adds its rows alongside the first.
- The audit reruns after each stored file.
- Stuck and failed documents: marked failed at start, retried by a button or by uploading again.
- Webhook on the demo: off.
- Webhook body: multipart, one `file` field. Answers after the work is done.
- File type from the bytes first; CSV kind from its header.
- Several browser files: one action call per file, up to 3 at once.
- No `INGEST_SECRET`: the webhook is disabled, the app still starts.
- Storage: no schema change.
- Reset also empties the uploads folder.
- Panel shows a headline line under the list.
- Same file in flight: answered as in progress. Rejected or failed files: kept as failed. The webhook returns the plain reason.
