import { describe, expect, it } from "vitest";
import {
  invoiceNumber,
  isValidVatRate,
  splitGross,
} from "./invoices";

describe("splitGross", () => {
  it("rozbija brutto na netto + VAT przy 8%", () => {
    // 108,00 zł brutto @ 8% -> 100,00 netto + 8,00 VAT
    expect(splitGross(10800, 8)).toEqual({ netGr: 10000, vatGr: 800 });
  });

  it("rozbija brutto przy 23%", () => {
    // 123,00 zł brutto @ 23% -> 100,00 netto + 23,00 VAT
    expect(splitGross(12300, 23)).toEqual({ netGr: 10000, vatGr: 2300 });
  });

  it("VAT 0% -> całość jako netto", () => {
    expect(splitGross(5000, 0)).toEqual({ netGr: 5000, vatGr: 0 });
  });

  it("VAT zawsze = brutto − netto (spójność przy zaokrągleniu)", () => {
    for (const gross of [1, 99, 100, 12345, 99999]) {
      for (const rate of [0, 5, 8, 23]) {
        const { netGr, vatGr } = splitGross(gross, rate);
        expect(netGr + vatGr).toBe(gross);
        expect(netGr).toBeGreaterThanOrEqual(0);
        expect(vatGr).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("invoiceNumber", () => {
  it("buduje numer wg rodzaju, sekwencji i roku", () => {
    expect(invoiceNumber("KONCOWA", 3, 2026)).toBe("FV 3/2026");
    expect(invoiceNumber("ZALICZKOWA", 1, 2026)).toBe("FZ 1/2026");
    expect(invoiceNumber("PROFORMA", 12, 2026)).toBe("PRO 12/2026");
  });

  it("nieznany rodzaj -> prefiks FV", () => {
    expect(invoiceNumber("INNE", 1, 2026)).toBe("FV 1/2026");
  });
});

describe("isValidVatRate", () => {
  it("akceptuje dozwolone stawki", () => {
    expect(isValidVatRate(8)).toBe(true);
    expect(isValidVatRate(23)).toBe(true);
    expect(isValidVatRate(0)).toBe(true);
    expect(isValidVatRate(7)).toBe(false);
    expect(isValidVatRate(100)).toBe(false);
  });
});
