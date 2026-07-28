import { describe, expect, it } from "vitest";
import { defaultGuards } from "./refresh";

describe("defaultGuards", () => {
  it("wylicza widełki z ceny bazowej: -30% / +80%", () => {
    expect(defaultGuards(20000)).toEqual({ minPriceGr: 14000, maxPriceGr: 36000 });
  });

  it("zaokrągla do pełnych groszy", () => {
    expect(defaultGuards(19999)).toEqual({ minPriceGr: 13999, maxPriceGr: 35998 });
  });

  it("nigdy nie schodzi poniżej 1 grosza", () => {
    expect(defaultGuards(1).minPriceGr).toBe(1);
  });
});
