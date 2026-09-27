# lib/extract

Classifies and extracts one PDF with one forced Claude tool call, then validates the result with the same converters the offline path uses. The only module that talks to Claude. Governing spec: [0005 LLM classify and extract](../../docs/specs/0005-llm-classify-extract/index.md).

## Files

- `extract.ts`: `extractDocument(input, deps)`, the entry point. Guards, one call, at most one repair turn, one log line; returns `Result<ExtractedDocument>` and never touches the database.
- `pdf.ts`: `readPdf` with `unpdf`. Refuses bytes without `%PDF-`, more than `MAX_PAGES` (20), or an unreadable file. Fewer than `SCAN_CHARS_PER_PAGE` (20) letters and digits per page means a scan, sent as a base64 `document` block; anything else goes as page marked text.
- `tools.ts`: the four strict tools (`record_invoice`, `record_contract`, `record_purchase_order`, `reject_document`) built from the `lib/schemas` extraction shapes via `toStrictSchema`; `KIND_BY_TOOL` maps the tool called to the document kind.
- `prompt.ts`, `request.ts`: the system prompt and `buildRequest` (forced `tool_choice: any`, thinking off, the repair turn). Pure.
- `validate.ts`: `validateToolCall` judges one response (stop reason, then the tool call through its `to*Record` converter). Pure.
- `client.ts`: `createModelClient()`, the only place the Anthropic client is constructed. With no key it returns deps with `apiKeySet: false`.
- `testing.ts`: test support only (sample bytes, fixture tool calls, fake clients). App code never imports it.

## Conventions

- The model id comes from `env.ANTHROPIC_MODEL` (default `claude-sonnet-5`). A model without forced tool choice needs spec 0005 revisited.
- The filename is never sent to the model. The model never computes money: every amount it copies is checked by the converters.
- Only a converter failure earns the one repair turn. A refusal, cut off, rejection or API error fails at once.
- Expected failures come back as `err`; only a non `APIError` throw escapes (a bug).
- One `logEvent` line per extraction with counts and outcome only; never document text, extracted values, the failure reason or the key.
- ESLint enforces the boundaries: `@anthropic-ai/sdk` is refused outside this folder, and `lib/db` is refused inside it (`boundaries.test.ts`).
- Tests use the fake clients from `testing.ts`. `live.test.ts` makes one real call and runs only when `ANTHROPIC_API_KEY` is set. After a prompt change, `pnpm audit:live` proves the 12 samples still match offline mode (12 to 24 paid calls). Fix the prompt, never the numbers.

_Drafted by /sync from the introducing change, worth a quick human pass._
