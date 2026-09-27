# n8n intake

## Overview

Holds the n8n workflow that watches a Google Drive folder and sends each new file to the app's `POST /api/ingest`. It is the machine intake path; browser uploads go through a Server Action instead. Built in Release 4 (Feature 12).

## Key files

| File | Owns |
|---|---|
| `n8n/intake.json` | Exported workflow: Google Drive trigger → HTTP Request to `/api/ingest` (not built yet) |

## Conventions

- Commit the workflow as exported JSON in `n8n/intake.json`; strip credentials and instance specific IDs before committing.
- The HTTP Request node sends the shared secret in the `X-Ingest-Secret` header, read from an n8n credential, never hardcoded in the JSON.
- The app URL is configurable in the workflow (local dev vs the public demo), not baked into nodes.

## Gotchas

- `/api/ingest` checks `X-Ingest-Secret` against `INGEST_SECRET` with a constant time compare, and rejects files over `MAX_UPLOAD_MB` before reading the body.
- The same file arriving by upload and by n8n dedupes on its SHA-256, so resending is safe.
- Send the file as one multipart field named `file`, with a `Content-Length` header (`411` without it). Error answers are `{ ok: false, error, documentId }`; a `422` means the document is stored as `failed` and can be retried (spec 0006).

## Agent skills

- [n8n-workflow-lifecycle-official](../.agents/skills/n8n-workflow-lifecycle-official/): `n8n-io/skills`, building, validating and exporting n8n workflows

## Related specs

- [0001 Stack and architecture](../docs/specs/0001-stack-architecture/index.md) (Intake row)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
