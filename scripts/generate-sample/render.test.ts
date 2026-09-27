import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extractText, getDocumentProxy } from "unpdf";
import { beforeAll, describe, expect, it } from "vitest";
import { toPaymentRecord, toReceiptRecord } from "../../lib/schemas/convert";
import { BRIEF_SAMPLE } from "../../lib/schemas/fixtures/brief-sample";
import { SampleManifest } from "../../lib/schemas/sample-manifest";
import { parseCsv } from "./csv";
import { dueDate, formatLongDate, formatMoney, formatQuantity } from "./format";
import { FOOTER_TEXT, PAYMENT_TERMS_TEXT, SCAN_FILENAME } from "./parties";
import {
  PAYMENTS_HEADER,
  RECEIPTS_HEADER,
  renderSample,
  type RenderedFile,
} from "./render";

const COMMITTED_DIR = fileURLToPath(
  new URL("../../public/sample", import.meta.url),
);

const EXPECTED_FILES = [
  "BW-5521.pdf",
  "BW-5530.pdf",
  "C-2026-014.pdf",
  "C-2026-022.pdf",
  "NL-88121.pdf",
  "NL-88203.pdf",
  "NL-88310.pdf",
  "NL88310.pdf",
  "PO-4501.pdf",
  "PO-4502.pdf",
  "PO-4503.pdf",
  "PO-4504.pdf",
  "ap_payments.csv",
  "manifest.json",
  "receipts.csv",
];

const collapse = (value: string): string => value.replace(/\s+/g, " ").trim();

/** Every page's text, whitespace runs collapsed (AC-3). */
const readPages = async (bytes: Uint8Array): Promise<readonly string[]> => {
  const pdf = await getDocumentProxy(bytes.slice());
  const { text } = await extractText(pdf, { mergePages: false });
  return text.map(collapse);
};

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

let files: readonly RenderedFile[] = [];
const fileNamed = (filename: string): RenderedFile => {
  const file = files.find((candidate) => candidate.filename === filename);
  if (file === undefined) throw new Error(`not rendered: ${filename}`);
  return file;
};
const textOf = async (filename: string): Promise<string> =>
  (await readPages(fileNamed(filename).bytes)).join(" ");

const expectAll = (text: string, values: readonly string[]): void => {
  const missing = values.filter((value) => !text.includes(collapse(value)));
  expect(missing).toEqual([]);
};

beforeAll(async () => {
  const rendered = await renderSample();
  if (!rendered.ok) throw new Error(rendered.error);
  files = rendered.value;
}, 30_000);

describe("renderSample output set (AC-1)", () => {
  it("renders exactly the 15 files", () => {
    expect(files.map((file) => file.filename).sort()).toEqual(
      [...EXPECTED_FILES].sort(),
    );
  });
});

describe("invoices read back with every fixture value (AC-3, AC-9)", () => {
  const textInvoices = BRIEF_SAMPLE.invoices.filter(
    (doc) => doc.filename !== SCAN_FILENAME,
  );

  it.each(textInvoices.map((doc) => [doc.filename, doc.extraction] as const))(
    "%s",
    async (filename, invoice) => {
      expectAll(await textOf(filename), [
        invoice.invoiceNumber,
        invoice.supplierName,
        formatLongDate(invoice.invoiceDate),
        `Currency: ${invoice.currency}`,
        ...(invoice.poNumber === null ? [] : [invoice.poNumber]),
        ...invoice.lines.flatMap((line) => [
          line.sku,
          line.description,
          formatQuantity(line.quantity),
          formatMoney(line.unitPrice),
          formatMoney(line.amount),
        ]),
        ...invoice.charges.flatMap((charge) => [
          charge.label,
          formatMoney(charge.amount),
        ]),
        `Subtotal ${formatMoney(invoice.subtotal)}`,
        `Total ${formatMoney(invoice.total)}`,
        PAYMENT_TERMS_TEXT,
        `Due date: ${formatLongDate(dueDate(invoice.invoiceDate))}`,
      ]);
    },
  );

  it("prints NL-88310 due on May 3, 2026", async () => {
    expect(await textOf("NL-88310.pdf")).toContain("Due date: May 3, 2026");
  });

  it("omits the PO line when the invoice has no PO", async () => {
    expect(await textOf("BW-5530.pdf")).not.toContain("PO number");
  });
});

describe("purchase orders read back with every fixture value (AC-3)", () => {
  it.each(
    BRIEF_SAMPLE.purchaseOrders.map(
      (doc) => [doc.filename, doc.extraction] as const,
    ),
  )("%s", async (filename, order) => {
    expectAll(await textOf(filename), [
      order.poNumber,
      order.supplierName,
      formatLongDate(order.orderDate),
      `Currency: ${order.currency}`,
      ...order.lines.flatMap((line) => [
        line.sku,
        line.description,
        formatQuantity(line.quantity),
        ...(line.unitPrice === null ? [] : [formatMoney(line.unitPrice)]),
      ]),
    ]);
  });
});

describe("contracts read back with every fixture value (AC-3, AC-5)", () => {
  it.each(
    BRIEF_SAMPLE.contracts.map(
      (doc) => [doc.filename, doc.extraction] as const,
    ),
  )("%s", async (filename, contract) => {
    expectAll(await textOf(filename), [
      contract.contractNumber,
      contract.supplierName,
      formatLongDate(contract.startDate),
      formatLongDate(contract.endDate),
      `Currency: ${contract.currency}`,
      ...contract.prices.flatMap((price) => [
        price.clause,
        price.sku,
        price.description,
        formatMoney(price.unitPrice),
      ]),
      ...(contract.freightClause === null ? [] : [contract.freightClause]),
      ...(contract.surchargeClause === null ? [] : [contract.surchargeClause]),
      ...contract.surcharges.map((surcharge) => surcharge.clause),
    ]);
  });

  it("C-2026-014 prints items 1 to 5, the included freight and the fuel cap", async () => {
    const text = await textOf("C-2026-014.pdf");
    expectAll(text, [
      ...[1, 2, 3, 4, 5].map((n) => `Schedule A, item ${n}`),
      "Section 4.2",
      "Freight shall not be invoiced separately",
      "Section 5.1",
      "fuel",
      "2.5%",
    ]);
  });

  it("C-2026-022 prints items 1 to 3, no surcharges and no freight wording", async () => {
    const text = await textOf("C-2026-022.pdf");
    expectAll(text, [
      ...[1, 2, 3].map((n) => `Schedule A, item ${n}`),
      "Section 6.1",
      "No surcharges",
    ]);
    expect(text).not.toContain("Schedule A, item 4");
    expect(text.toLowerCase()).not.toContain("freight");
  });
});

describe("footer (AC-9)", () => {
  it("is on every page of every text PDF", async () => {
    const pdfs = files.filter(
      (file) =>
        file.filename.endsWith(".pdf") && file.filename !== SCAN_FILENAME,
    );
    const pages = await Promise.all(pdfs.map((file) => readPages(file.bytes)));
    const missing = pdfs.filter((_, index) =>
      pages[index].some((page) => !page.includes(FOOTER_TEXT)),
    );
    expect(missing.map((file) => file.filename)).toEqual([]);
  });
});

describe("the NL88310 scan (AC-4)", () => {
  it("is one page with no text layer, under 2 MB", async () => {
    const bytes = fileNamed(SCAN_FILENAME).bytes;
    const pages = await readPages(bytes);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toBe("");
    expect(bytes.length).toBeLessThan(2 * 1024 * 1024);
  });

  it("draws no text operations in the PDF itself", () => {
    const raw = Buffer.from(fileNamed(SCAN_FILENAME).bytes).toString("latin1");
    expect(raw).not.toContain("/Font");
  });
});

describe("CSVs (AC-6)", () => {
  const ref = (filename: string) => ({ documentId: 1, filename });

  it("receipts.csv round trips to the same records", () => {
    const csvText = new TextDecoder().decode(fileNamed("receipts.csv").bytes);
    const parsed = parseCsv(csvText);
    expect(parsed.header.join(",")).toBe(
      "po_number,sku,quantity_received,received_date",
    );
    expect(parsed.header).toEqual(RECEIPTS_HEADER);
    const fromFile = parsed.rows.map((row, index) =>
      toReceiptRecord(
        Object.fromEntries(parsed.header.map((key, col) => [key, row[col]])),
        ref("receipts.csv"),
        index + 1,
      ),
    );
    const fromFixture = BRIEF_SAMPLE.receipts.rows.map((row, index) =>
      toReceiptRecord(row, ref("receipts.csv"), index + 1),
    );
    expect(fromFile).toEqual(fromFixture);
    expect(fromFile.every((result) => result.ok)).toBe(true);
  });

  it("ap_payments.csv round trips to the same records", () => {
    const csvText = new TextDecoder().decode(
      fileNamed("ap_payments.csv").bytes,
    );
    const parsed = parseCsv(csvText);
    expect(parsed.header.join(",")).toBe(
      "invoice_number,supplier,amount,paid_date,reference",
    );
    expect(parsed.header).toEqual(PAYMENTS_HEADER);
    const fromFile = parsed.rows.map((row, index) =>
      toPaymentRecord(
        Object.fromEntries(parsed.header.map((key, col) => [key, row[col]])),
        ref("ap_payments.csv"),
        index + 1,
      ),
    );
    const fromFixture = BRIEF_SAMPLE.payments.rows.map((row, index) =>
      toPaymentRecord(row, ref("ap_payments.csv"), index + 1),
    );
    expect(fromFile).toEqual(fromFixture);
    expect(fromFile.every((result) => result.ok)).toBe(true);
  });

  it("uses LF endings, a trailing newline and no byte order mark", () => {
    ["receipts.csv", "ap_payments.csv"].forEach((filename) => {
      const bytes = fileNamed(filename).bytes;
      const csvText = new TextDecoder().decode(bytes);
      expect(bytes[0]).not.toBe(0xef);
      expect(csvText).not.toContain("\r");
      expect(csvText.endsWith("\n")).toBe(true);
    });
  });
});

describe("manifest.json (AC-8)", () => {
  it("validates and describes every data file exactly", () => {
    const json: unknown = JSON.parse(
      new TextDecoder().decode(fileNamed("manifest.json").bytes),
    );
    const manifest = SampleManifest.parse(json);
    const dataFiles = files.filter((file) => file.filename !== "manifest.json");
    expect(manifest.files.map((entry) => entry.filename)).toEqual(
      dataFiles.map((file) => file.filename).sort(),
    );
    manifest.files.forEach((entry) => {
      const file = fileNamed(entry.filename);
      expect(entry.sha256).toBe(sha256(file.bytes));
      expect(entry.sizeBytes).toBe(file.bytes.length);
      const expectedLayer = entry.filename.endsWith(".csv")
        ? null
        : entry.filename !== SCAN_FILENAME;
      expect(entry.hasTextLayer).toBe(expectedLayer);
    });
    expect(
      manifest.files.find((entry) => entry.filename === "receipts.csv")?.kind,
    ).toBe("receipts_csv");
    expect(
      manifest.files.find((entry) => entry.filename === "C-2026-014.pdf")?.kind,
    ).toBe("contract");
  });

  it("holds no timestamp", () => {
    const text = new TextDecoder().decode(fileNamed("manifest.json").bytes);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe("determinism and drift (AC-7)", () => {
  it("renders the same bytes twice", async () => {
    const again = await renderSample();
    if (!again.ok) throw new Error(again.error);
    expect(
      again.value.map((file) => [file.filename, sha256(file.bytes)]),
    ).toEqual(files.map((file) => [file.filename, sha256(file.bytes)]));
  }, 30_000);

  it("matches the committed files in public/sample/", async () => {
    const committed = (await readdir(COMMITTED_DIR)).sort();
    expect(committed).toEqual([...EXPECTED_FILES].sort());
    const drifted = (
      await Promise.all(
        files.map(async (file) => {
          const onDisk = await readFile(`${COMMITTED_DIR}/${file.filename}`);
          return sha256(onDisk) === sha256(file.bytes) ? [] : [file.filename];
        }),
      )
    ).flat();
    expect(drifted, "regenerate with pnpm generate:sample and commit").toEqual(
      [],
    );
  });
});
