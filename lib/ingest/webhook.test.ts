import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getDocument } from "@/lib/db/documents";
import { TEST_NOW } from "@/lib/db/testing";
import type { ExtractDeps } from "@/lib/extract/extract";
import { fakeMessage, fixtureClient, readSample } from "@/lib/extract/testing";
import { harness, type IngestHarness } from "./testing";
import {
  handleIngestRequest,
  MULTIPART_OVERHEAD_BYTES,
  SECRET_HEADER,
  type WebhookConfig,
} from "./webhook";

/** The webhook's guards and answers (spec 0006, AC-3, AC-5, AC-6, AC-9). */

const SECRET = "s".repeat(64);
const URL = "http://localhost/api/ingest";

const REJECT = fakeMessage([
  {
    type: "tool_use",
    id: "toolu_1",
    name: "reject_document",
    input: { reason: "a menu" },
  } as never,
]);

/** A multipart body with one part, and its real content type and length. */
const multipart = async (
  field: string,
  filename: string,
  bytes: Uint8Array,
): Promise<{ body: Uint8Array<ArrayBuffer>; contentType: string }> => {
  const form = new FormData();
  form.append(field, new Blob([new Uint8Array(bytes)]), filename);
  const encoded = new Response(form);
  return {
    body: new Uint8Array(await encoded.arrayBuffer()),
    contentType: encoded.headers.get("content-type") ?? "",
  };
};

type RequestOptions = {
  readonly secret?: string | null;
  readonly contentLength?: string | null;
  readonly field?: string;
};

const request = async (
  filename: string,
  bytes: Uint8Array,
  options: RequestOptions = {},
): Promise<Request> => {
  const { body, contentType } = await multipart(
    options.field ?? "file",
    filename,
    bytes,
  );
  const headers = new Headers({ "content-type": contentType });
  const secret = options.secret === undefined ? SECRET : options.secret;
  if (secret !== null) headers.set(SECRET_HEADER, secret);
  const length =
    options.contentLength === undefined
      ? String(body.length)
      : options.contentLength;
  if (length !== null) headers.set("content-length", length);
  return new Request(URL, { method: "POST", headers, body });
};

const sampleRequest = async (filename: string, options?: RequestOptions) =>
  request(filename, await readSample(filename), options);

/** A body that counts how much of it was read. */
const trackedRequest = (size: number, declared: string) => {
  const read = { bytes: 0 };
  const chunk = new Uint8Array(64 * 1024);
  const body = new ReadableStream<Uint8Array>({
    pull: (controller) => {
      if (read.bytes >= size) return controller.close();
      read.bytes += chunk.length;
      controller.enqueue(chunk);
    },
  });
  const req = new Request(URL, {
    method: "POST",
    headers: {
      [SECRET_HEADER]: SECRET,
      "content-length": declared,
      "content-type": "multipart/form-data; boundary=x",
    },
    body,
    duplex: "half",
  } as RequestInit);
  return { req, read };
};

describe("handleIngestRequest", () => {
  let client: ExtractDeps;
  let h: IngestHarness;
  let config: WebhookConfig;
  let stdout: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    client = await fixtureClient(new Map([["NL-88203.pdf", [REJECT, REJECT]]]));
  });

  beforeEach(async () => {
    stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    h = await harness(client, { maxUploadBytes: 1_048_576 });
    config = {
      demoMode: false,
      secret: SECRET,
      db: () => h.db,
      deps: () => h.deps,
      clock: () => TEST_NOW,
    };
  });

  afterEach(async () => {
    stdout.mockRestore();
    await h.cleanUp();
  });

  const call = async (req: Request, overrides: Partial<WebhookConfig> = {}) => {
    const response = await handleIngestRequest(req, {
      ...config,
      ...overrides,
    });
    return { status: response.status, body: await response.json() };
  };

  it("ingests one file and answers 200 with the outcome (AC-3)", async () => {
    expect(await call(await sampleRequest("NL-88121.pdf"))).toEqual({
      status: 200,
      body: {
        ok: true,
        value: {
          documentId: 1,
          filename: "NL-88121.pdf",
          kind: "invoice",
          status: "done",
          alreadyIngested: false,
          headline: expect.objectContaining({
            findingCount: expect.any(Number),
          }),
        },
      },
    });
    expect(getDocument(h.db, 1)).toMatchObject({ source: "webhook" });
  });

  it("answers the same file again with alreadyIngested (AC-8)", async () => {
    await call(await sampleRequest("receipts.csv"));
    expect(await call(await sampleRequest("receipts.csv"))).toMatchObject({
      status: 200,
      body: { value: { alreadyIngested: true } },
    });
  });

  it("answers 422 with the reason and document id when extraction fails (AC-9)", async () => {
    expect(await call(await sampleRequest("NL-88203.pdf"))).toEqual({
      status: 422,
      body: {
        ok: false,
        error: expect.stringContaining("not an invoice"),
        documentId: 1,
      },
    });
  });

  it("answers 409 while the same document is being processed (AC-8)", async () => {
    const [first, second] = await Promise.all([
      call(await sampleRequest("NL-88310.pdf")),
      call(await sampleRequest("NL-88310.pdf")),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect([first, second].find((r) => r.status === 409)?.body).toEqual({
      ok: false,
      error: "already being processed",
      documentId: 1,
    });
  });

  it.each([
    [{ demoMode: true }, 503, "intake is disabled on the demo"],
    [{ secret: undefined }, 503, "intake is not configured"],
  ])("refuses with %j (AC-6)", async (overrides, status, error) => {
    expect(await call(await sampleRequest("receipts.csv"), overrides)).toEqual({
      status,
      body: { ok: false, error, documentId: null },
    });
  });

  it("checks the demo before the secret (AC-6)", async () => {
    const req = await sampleRequest("receipts.csv", { secret: null });
    expect(
      await call(req, { demoMode: true, secret: undefined }),
    ).toMatchObject({
      status: 503,
      body: { error: "intake is disabled on the demo" },
    });
  });

  it.each([
    ["a missing secret", null],
    ["a wrong secret", "t".repeat(64)],
    ["a short secret", "s"],
  ])(
    "answers 401 to %s without reading the body (AC-6)",
    async (_label, secret) => {
      const { req, read } = trackedRequest(1024 * 1024, "1048576");
      const headers = new Headers(req.headers);
      if (secret === null) headers.delete(SECRET_HEADER);
      else headers.set(SECRET_HEADER, secret);
      const response = await handleIngestRequest(
        new Request(req, { headers }),
        config,
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        ok: false,
        error: "unauthorized",
        documentId: null,
      });
      expect(read.bytes).toBeLessThanOrEqual(64 * 1024 * 2);
    },
  );

  it("answers 411 with no Content-Length (AC-5)", async () => {
    const req = await sampleRequest("receipts.csv", { contentLength: null });
    expect(await call(req)).toEqual({
      status: 411,
      body: {
        ok: false,
        error: "send a Content-Length header",
        documentId: null,
      },
    });
  });

  it("answers 413 from Content-Length alone, without reading the body (AC-5)", async () => {
    const limit = 1_048_576 + MULTIPART_OVERHEAD_BYTES;
    const { req, read } = trackedRequest(4 * 1_048_576, String(limit + 1));
    expect(await call(req)).toEqual({
      status: 413,
      body: {
        ok: false,
        error: "the file is larger than 1 MB",
        documentId: null,
      },
    });
    expect(read.bytes).toBeLessThanOrEqual(64 * 1024 * 2);
  });

  it("stops reading with 413 once a body passes the limit under a small declared length (AC-5)", async () => {
    const limit = 1_048_576 + MULTIPART_OVERHEAD_BYTES;
    const { req, read } = trackedRequest(8 * 1_048_576, "100");
    expect(await call(req)).toMatchObject({ status: 413 });
    expect(read.bytes).toBeLessThanOrEqual(limit + 3 * 64 * 1024);
  });

  it("answers 413 for a file just over the limit that fits in the overhead (AC-5)", async () => {
    const bytes = new Uint8Array(1_048_577);
    bytes.set(new TextEncoder().encode("%PDF-1.7"));
    expect(await call(await request("big.pdf", bytes))).toEqual({
      status: 413,
      body: {
        ok: false,
        error: "the file is larger than 1 MB",
        documentId: null,
      },
    });
  });

  it("answers 400 with no file part (AC-6)", async () => {
    const req = await sampleRequest("receipts.csv", { field: "document" });
    expect(await call(req)).toEqual({
      status: 400,
      body: {
        ok: false,
        error: "send one file in a multipart field named file",
        documentId: null,
      },
    });
  });

  it.each([
    ["an unknown type", "notes.txt", new TextEncoder().encode("hello"), 415],
    ["an empty file", "empty.pdf", new Uint8Array(), 400],
  ])(
    "maps %s to its status (AC-4, AC-5)",
    async (_label, filename, bytes, status) => {
      expect((await call(await request(filename, bytes))).status).toBe(status);
    },
  );

  it("logs a refused call with only its source, outcome and time (AC-16)", async () => {
    await call(await sampleRequest("receipts.csv", { secret: "wrong" }));
    const lines = stdout.mock.calls.map(([line]: readonly unknown[]) =>
      JSON.parse(String(line)),
    );
    expect(lines).toEqual([
      {
        event: "ingest",
        source: "webhook",
        outcome: "unauthorized",
        ms: 0,
        at: expect.any(String),
      },
    ]);
  });
});
