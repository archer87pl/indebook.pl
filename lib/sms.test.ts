import { describe, expect, it } from "vitest";
import { normalizePhone } from "./sms";

describe("normalizePhone", () => {
  it("polski numer 9-cyfrowy dostaje prefiks +48", () => {
    expect(normalizePhone("600100200")).toBe("+48600100200");
    expect(normalizePhone("600 100 200")).toBe("+48600100200");
    expect(normalizePhone("600-100-200")).toBe("+48600100200");
  });

  it("prefiksy międzynarodowe: +, 00 i gołe 48", () => {
    expect(normalizePhone("+48 600 100 200")).toBe("+48600100200");
    expect(normalizePhone("0048600100200")).toBe("+48600100200");
    expect(normalizePhone("48600100200")).toBe("+48600100200");
    expect(normalizePhone("+49 170 1234567")).toBe("+491701234567");
  });

  it("odrzuca numery nienadające się do wysyłki", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("brak telefonu")).toBeNull();
    expect(normalizePhone("600100200300400")).toBeNull();
  });
});
