import { beforeEach, describe, expect, it } from "vitest";
import {
  toContractRecord,
  toInvoiceRecord,
  toPaymentRecord,
} from "@/lib/schemas/convert";
import {
  BRIEF_INVOICED_TOTAL_CENTS,
  BRIEF_SAMPLE,
} from "@/lib/schemas/fixtures/brief-sample";
import { openDb, type Db } from "./client";
import {
  saveContract,
  saveInvoice,
  savePayments,
  loadAuditInput,
} from "./records";
import { contracts, documents, suppliers } from "./schema";
import { addDocument, seedBriefSample, TEST_NOW, unwrap } from "./testing";

const [northlineContract] = BRIEF_SAMPLE.contracts;

describe("brief sample round trip", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb(":memory:");
  });

  it("loads back deep equal to the converted records, to the cent (AC-8)", () => {
    const converted = seedBriefSample(db);
    expect(loadAuditInput(db)).toEqual(converted);
  });

  it("derives $53,939.60 invoiced from the stored invoices, duplicate included (AC-15)", () => {
    seedBriefSample(db);
    const total = loadAuditInput(db).invoices.reduce(
      (sum, invoice) => sum + invoice.totalCents,
      0,
    );
    expect(total).toBe(BRIEF_INVOICED_TOTAL_CENTS);
  });

  it("marks every document done with its kind", () => {
    seedBriefSample(db);
    const stored = db.select().from(documents).all();
    expect(stored).toHaveLength(14);
    expect(stored.every((doc) => doc.status === "done")).toBe(true);
    expect(stored.find((doc) => doc.filename === "receipts.csv")?.kind).toBe(
      "receipts_csv",
    );
    expect(stored.find((doc) => doc.filename === "BW-5521.pdf")?.kind).toBe(
      "invoice",
    );
  });

  it("keeps two suppliers", () => {
    seedBriefSample(db);
    expect(
      db
        .select()
        .from(suppliers)
        .all()
        .map((s) => s.key),
    ).toEqual(["northline industrial supply", "brightwater packaging"]);
  });
});

describe("suppliers", () => {
  it("resolves a name with a legal suffix to the same supplier row (AC-9)", () => {
    const db = openDb(":memory:");
    unwrap(
      saveContract(
        db,
        unwrap(
          toContractRecord(
            northlineContract.extraction,
            addDocument(db, "C.pdf"),
          ),
        ),
        TEST_NOW,
      ),
    );
    const ledger = addDocument(db, "ap_payments.csv");
    const row = {
      ...BRIEF_SAMPLE.payments.rows[0],
      supplier: "Northline Industrial Supply Inc.",
    };
    unwrap(
      savePayments(
        db,
        ledger.documentId,
        [unwrap(toPaymentRecord(row, ledger, 1))],
        TEST_NOW,
      ),
    );

    const rows = db.select().from(suppliers).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: "northline industrial supply",
      name: "Northline Industrial Supply",
    });
    expect(loadAuditInput(db).payments[0].supplierKey).toBe(
      "northline industrial supply",
    );
  });
});

describe("saveContract overlap guard (AC-10)", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb(":memory:");
    unwrap(
      saveContract(
        db,
        unwrap(
          toContractRecord(
            northlineContract.extraction,
            addDocument(db, "C-2026-014.pdf"),
          ),
        ),
        TEST_NOW,
      ),
    );
  });

  const overlapping = (
    startDate: string,
    endDate: string,
    supplierName = "Northline Industrial Supply Inc.",
  ) => ({
    ...northlineContract.extraction,
    contractNumber: "C-2026-099",
    supplierName,
    startDate,
    endDate,
  });

  it.each([
    ["2026-12-31", "2027-12-31"],
    ["2025-06-01", "2026-01-01"],
    ["2026-03-01", "2026-04-01"],
  ])(
    "refuses a term from %s to %s, naming C-2026-014, and stores nothing",
    (start, end) => {
      const doc = addDocument(db, "C-2026-099.pdf");
      const result = saveContract(
        db,
        unwrap(toContractRecord(overlapping(start, end), doc)),
        TEST_NOW,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("C-2026-014");
      expect(db.select().from(contracts).all()).toHaveLength(1);
      expect(db.select().from(suppliers).all()).toHaveLength(1);
      expect(
        db
          .select()
          .from(documents)
          .all()
          .find((d) => d.id === doc.documentId)?.status,
      ).toBe("queued");
    },
  );

  it("accepts the next term of the same supplier and any term of another supplier", () => {
    const next = saveContract(
      db,
      unwrap(
        toContractRecord(
          overlapping("2027-01-01", "2027-12-31"),
          addDocument(db, "a.pdf"),
        ),
      ),
    );
    const other = saveContract(
      db,
      unwrap(
        toContractRecord(
          overlapping("2026-01-01", "2026-12-31", "Other Supply Ltd"),
          addDocument(db, "b.pdf"),
        ),
      ),
    );
    expect(next.ok && other.ok).toBe(true);
  });
});

describe("saving into a missing document", () => {
  it("fails instead of storing orphan records", () => {
    const db = openDb(":memory:");
    const record = unwrap(
      toContractRecord(northlineContract.extraction, {
        documentId: 77,
        filename: "x.pdf",
      }),
    );
    expect(saveContract(db, record)).toEqual({
      ok: false,
      error: "document 77 does not exist",
    });
    const invoice = unwrap(
      toInvoiceRecord(BRIEF_SAMPLE.invoices[0].extraction, {
        documentId: 78,
        filename: "y.pdf",
      }),
    );
    expect(saveInvoice(db, invoice)).toEqual({
      ok: false,
      error: "document 78 does not exist",
    });
    expect(db.select().from(suppliers).all()).toEqual([]);
  });

  it("fails when a CSV row belongs to another document", () => {
    const db = openDb(":memory:");
    const ledger = addDocument(db, "ap_payments.csv");
    const stray = unwrap(
      toPaymentRecord(
        BRIEF_SAMPLE.payments.rows[0],
        { documentId: 99, filename: "x.csv" },
        1,
      ),
    );
    expect(savePayments(db, ledger.documentId, [stray]).ok).toBe(false);
  });
});
