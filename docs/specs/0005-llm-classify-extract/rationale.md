# 0005. LLM classify and extract: decision record

The reasoning behind [index.md](index.md). `/develop` does not need this file.

## Context

Release 1 proved the audit on structured copies of the sample: 8 findings, $9,766.85. Release 2 has to reach the same answer from the actual PDFs. That means a model reads each document, and the brief is specific about the shape: one API call per document, one tool per document type, and the model must call exactly one, so a single call both classifies and extracts. Scanned PDFs with no text layer are sent as the file itself.

Spec 0001 already picked the provider and the defaults (`@anthropic-ai/sdk`, `claude-sonnet-5`, `unpdf`, Zod as the one schema source) and spec 0002 fixed what extraction must produce: text as printed, turned into cents only by the pure converters, which reject any document whose own numbers don't add up. What neither spec settles is how the call is set up, what happens when the model gets something wrong, where a document that isn't one of the three types goes, how a scan is detected, and how anyone proves the live path matches offline mode.

Those gaps matter. On the current model, forced tool choice doesn't work with thinking on, so the call setup is a real choice, not a default. A single misread digit fails the arithmetic guard, and with no recovery path one bad read sinks a whole run. "Matches offline" is only as good as what gets compared: findings alone can hide a misread that happens not to move a number. And the ingest feature that follows needs extraction as a plain function, not tangled with storage.

The volume is tiny (12 documents, a few seconds each) and the data is fictional, so cost and compliance are not the forces here. Correctness to the cent, clear failure reasons and a short build are.

## Options considered

### Option 1: One forced call with four strict tools, thinking off, one repair turn (chosen)

`tool_choice: any` over `record_invoice`, `record_contract`, `record_purchase_order` and `reject_document`, all `strict: true`, thinking disabled. Text for text PDFs, the file for scans. A validation failure gets one `is_error` tool result and a second try.

**Pros**:
- Exactly the brief's design. The API guarantees one well formed call, so the code only judges values.
- One call per document in the normal case; the repair turn recovers a one off misread.
- `reject_document` gives an unsupported file a clean, explicit failure.

**Cons**:
- No thinking on hard layouts.
- Forced tool choice is gone on newer models, so a model upgrade means a small rewrite of the call.

### Option 2: Two calls, classify first, then extract with one schema

A cheap first call returns only the kind; a second call extracts with just that type's tool.

**Pros**:
- Each extraction call sees one schema, so there's less for the model to weigh.
- The classification step can use a smaller, cheaper model.

**Cons**:
- Twice the calls and latency for every document, against the brief's "one API call per document".
- Two places to fail and two prompts to keep in step.

### Option 3: Structured outputs with one union schema

`output_config.format` with a discriminated union of the three extraction shapes plus a rejection, no tools.

**Pros**:
- One call, and the response is schema valid JSON, with no tool plumbing.
- Keeps working on models that drop forced tool choice.

**Cons**:
- Departs from the brief's tool per type design, which is part of what the portfolio shows.
- A large union schema is harder for strict decoding, and the error when it misfires is less direct than a wrong tool name.

### Option 4: Always send the PDF, adaptive thinking, auto tool choice

Every document goes as a file, thinking on at low effort, `tool_choice: auto` with an instruction to call one tool.

**Pros**:
- One input path, and the model sees the layout the way a person does.
- Works on every current model.

**Cons**:
- Several times the input tokens per document, plus thinking tokens.
- `auto` can end with no tool call, which becomes one more failure to handle.
- Drops the brief's text path for documents with a text layer.

## Rationale

Option 1 is the brief's own design and the cheapest one that is still safe. The main risk in this feature is a misread number, not a misclassified document. The spec 0002 arithmetic guard already catches misreads, so what's missing is a way to recover from one without failing the run. One repair turn fits that exactly: the model sees the named line that doesn't add up and copies it again. A second retry would mostly spend money on documents that are truly broken. Turning thinking off is the price of forced tool choice on Sonnet 5. The job is copying printed values, which gains little from thinking, and the guards stay the real safety net. If a model upgrade takes forced choice away, the change is small and stays inside `request.ts` and `validate.ts`, and it is written down as a follow up.

Option 2 doubles the calls to solve a problem (classification) the forced tool call already solves for free. Option 3 is the stronger fallback if tool choice ever goes away, but today it would trade the brief's visible design for no gain. Option 4 spends the most tokens to fix a text order problem that spec 0003's read back tests already ruled out for these layouts.

The other calls follow from the same force, correctness to the cent with clear reasons:
- Comparing records, not just findings, makes "matches offline" name the exact file and field that differs. Collapsing whitespace in free text stops layout noise from failing the run while still catching a reworded clause.
- Keeping `extractDocument` free of the database, and storing the live run in one transaction only after every document reads cleanly, means a failed run never leaves half a sample behind. It also hands Feature 8 a plain function to wrap.
- The scan rule counts letters and digits per page (fewer than 20) instead of testing for empty text, so a stray page number or stamp on a scan can't make it look like a text PDF.
- Not sending the filename keeps the classification blind, so checking it against the manifest proves something.
- Four calls at a time finishes 12 documents in about three rounds, inside the brief's "under a minute", without leaning on rate limit retries.
- The raw tool output is not stored. The records are a faithful copy of it and the evidence already names file and clause, so a new column would mostly store document content for no reader. `--dump` covers debugging.

### Calls made while writing (the engineer did not weigh in)

- **`max_tokens` 8192**: the largest sample document (a contract) needs well under 2,000 output tokens, so 8192 leaves a wide margin and stays non streaming. Runner up: 4096, tighter but closer to cutting off a long contract.
- **SDK `timeout: 60_000`, `maxRetries: 2`**: one document should take seconds. A minute bounds a stuck call, and the SDK already retries 429 and 5xx. Runner up: the SDK's 10 minute default, too long for a person waiting on a command.
- **Prompt caching on the system prompt**: tools and system never change, so it is free to add. If the prefix is under the model's cache minimum it simply doesn't cache. Runner up: no caching, a small loss on every run.
- **`MAX_PAGES = 20`**: every sample document is one or two pages, and 20 bounds the cost of a surprise upload well under the API's limits. Runner up: no cap, which leaves a 500 page PDF to Feature 8's size limit alone.
- **Page markers in the text** (`--- page N ---`): they keep multi page contracts readable and cost almost nothing. Runner up: joined text, which loses where a clause sits.
- **Validation by converting with a placeholder ref** (`documentId: 0`): the converters are pure and only copy the ref, so running them with a placeholder is the cheapest way to reuse the arithmetic guard before a real id exists. Runner up: split the converters into validate and build steps, which touches spec 0002 code for no behavior change.
- **Log fields exclude the failure reason text**: converter reasons quote document values, and spec 0001 forbids logging document contents. The reason still reaches the caller in the `Result` and the operator in the command output.
