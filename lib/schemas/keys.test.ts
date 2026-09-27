import { describe, expect, it } from "vitest";
import {
  findingKey,
  normalizeInvoiceNumber,
  normalizeSupplierKey,
} from "./keys";

describe("normalizeSupplierKey", () => {
  it("resolves a name with and without a legal suffix to one key", () => {
    const key = normalizeSupplierKey("Northline Industrial Supply");
    expect(key).toBe("northline industrial supply");
    expect(normalizeSupplierKey("Northline Industrial Supply Inc.")).toBe(key);
    expect(normalizeSupplierKey("  NORTHLINE  Industrial   Supply, INC ")).toBe(
      key,
    );
  });

  it.each([
    ["Brightwater Packaging Co.", "brightwater packaging"],
    ["Brightwater Packaging Company", "brightwater packaging"],
    ["Acme Widgets LLC", "acme widgets"],
    ["Acme Widgets Ltd", "acme widgets"],
    ["Acme Widgets Corp.", "acme widgets"],
    ["Acme Widgets Co. Inc.", "acme widgets"],
    ["O'Brien & Sons", "o brien sons"],
  ])("normalizes %j to %j", (name, key) => {
    expect(normalizeSupplierKey(name)).toBe(key);
  });

  it("keeps a name made only of a suffix word", () => {
    expect(normalizeSupplierKey("Company")).toBe("company");
  });

  it("drops a suffix only as a whole trailing word", () => {
    expect(normalizeSupplierKey("Costco")).toBe("costco");
  });
});

describe("normalizeInvoiceNumber", () => {
  it("matches NL-88310 and NL88310", () => {
    expect(normalizeInvoiceNumber("NL-88310")).toBe("NL88310");
    expect(normalizeInvoiceNumber("NL88310")).toBe("NL88310");
    expect(normalizeInvoiceNumber(" nl/883.10 ")).toBe("NL88310");
  });
});

describe("findingKey", () => {
  it("builds check, supplier key, printed invoice number and detail", () => {
    expect(
      findingKey({
        check: "contract_price",
        supplierKey: "northline industrial supply",
        invoiceNumber: "NL-88310",
        detail: "NL-BRG-6204",
      }),
    ).toBe("contract_price:northline industrial supply:NL-88310:NL-BRG-6204");
  });

  it("uses - when there is no detail", () => {
    expect(
      findingKey({
        check: "duplicate",
        supplierKey: "northline industrial supply",
        invoiceNumber: "NL88310",
      }),
    ).toBe("duplicate:northline industrial supply:NL88310:-");
  });
});
