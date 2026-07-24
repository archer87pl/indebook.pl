import { describe, expect, it } from "vitest";
import { signState, verifyState } from "./oauth-state";

describe("oauth-state", () => {
  it("round-trip: podpisany state zwraca propertyId", () => {
    const s = signState(42);
    expect(verifyState(s)).toBe(42);
  });
  it("zmanipulowany podpis → null", () => {
    const s = signState(42).slice(0, -2) + "00";
    expect(verifyState(s)).toBeNull();
  });
  it("przeterminowany token → null", () => {
    const s = signState(42);
    expect(verifyState(s, -1)).toBeNull();
  });
  it("śmieci → null", () => {
    expect(verifyState("abc")).toBeNull();
  });
});
