import { describe, expect, it } from "vitest";
import { briefSampleRecords } from "@/lib/schemas/fixtures/brief-sample-records";
import type { AuditInput, ContractRecord } from "@/lib/schemas/records";
import { buildContext } from "./context";

const NORTHLINE = "northline industrial supply";
const BRIGHTWATER = "brightwater packaging";

describe("buildContext", () => {
  const input = briefSampleRecords();
  const ctx = buildContext(input);

  it("finds the contract in force on a date, inclusive of both ends", () => {
    expect(ctx.contractFor(NORTHLINE, "2026-01-01")?.contractNumber).toBe(
      "C-2026-014",
    );
    expect(ctx.contractFor(NORTHLINE, "2026-12-31")?.contractNumber).toBe(
      "C-2026-014",
    );
    expect(ctx.contractFor(NORTHLINE, "2025-12-31")).toBeNull();
    expect(ctx.contractFor(BRIGHTWATER, "2026-01-31")).toBeNull();
    expect(ctx.contractFor("someone else", "2026-06-01")).toBeNull();
  });

  it("picks the latest start date when hand built contracts overlap", () => {
    const [northline] = input.contracts;
    const later: ContractRecord = {
      ...northline,
      documentId: 50,
      contractNumber: "C-LATER",
      startDate: "2026-06-01",
    };
    const overlapping = buildContext({
      ...input,
      contracts: [later, northline],
    });
    expect(
      overlapping.contractFor(NORTHLINE, "2026-07-01")?.contractNumber,
    ).toBe("C-LATER");
    expect(
      overlapping.contractFor(NORTHLINE, "2026-02-01")?.contractNumber,
    ).toBe("C-2026-014");
  });

  it("looks up purchase orders and receipts", () => {
    expect(ctx.poByNumber.get("PO-4502")?.documentId).toBe(4);
    expect(ctx.poByNumber.get("PO-9999")).toBeUndefined();
    expect(
      ctx.receiptsFor("PO-4502", "NL-BLT-A42").map((r) => r.quantityReceived),
    ).toEqual([360]);
    expect(ctx.receiptsFor("PO-4502", "NL-BRG-6204")).toEqual([]);
    expect(ctx.poHasReceipts("PO-4504")).toBe(true);
    expect(ctx.poHasReceipts("PO-9999")).toBe(false);
  });

  it("finds payments by supplier and normalized invoice number, in row order", () => {
    expect(ctx.paymentsFor(NORTHLINE, ["NL88310"]).map((p) => p.rowNo)).toEqual(
      [4, 5],
    );
    expect(ctx.paymentsFor(BRIGHTWATER, ["NL88310"])).toEqual([]);
    expect(ctx.paymentsFor(BRIGHTWATER, ["BW5530"])).toEqual([]);
  });

  it("indexes invoices by document", () => {
    expect(ctx.invoiceByDocumentId.get(12)?.invoiceNumber).toBe("BW-5530");
  });

  it("gives the same answers whatever the input order", () => {
    const reversed: AuditInput = {
      invoices: [...input.invoices].reverse(),
      contracts: [...input.contracts].reverse(),
      purchaseOrders: [...input.purchaseOrders].reverse(),
      receipts: [...input.receipts].reverse(),
      payments: [...input.payments].reverse(),
    };
    const other = buildContext(reversed);
    expect(other.paymentsFor(NORTHLINE, ["NL88310"])).toEqual(
      ctx.paymentsFor(NORTHLINE, ["NL88310"]),
    );
    expect(other.receiptsFor("PO-4501", "NL-BRG-6204")).toEqual(
      ctx.receiptsFor("PO-4501", "NL-BRG-6204"),
    );
  });
});
