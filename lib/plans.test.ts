import { describe, expect, it } from "vitest";
import { planDef, sitePlanFeatures } from "./plans";

describe("sitePlanFeatures", () => {
  it("FREE: bez kreatora i bez domeny", () => {
    expect(sitePlanFeatures("FREE")).toEqual({ builder: false, customDomain: false });
  });

  it("STANDARD: kreator + subdomena, bez własnej domeny", () => {
    expect(sitePlanFeatures("STANDARD")).toEqual({ builder: true, customDomain: false });
  });

  it("PRO: kreator i własna domena", () => {
    expect(sitePlanFeatures("PRO")).toEqual({ builder: true, customDomain: true });
  });

  it("nieznany plan traktowany jak FREE", () => {
    expect(sitePlanFeatures("XXX")).toEqual({ builder: false, customDomain: false });
  });
});

describe("planDef — wpisy o stronie WWW", () => {
  it("STANDARD i PRO wspominają stronę WWW w features", () => {
    expect(planDef("STANDARD").features.join(" ")).toMatch(/stron/i);
    expect(planDef("PRO").features.join(" ")).toMatch(/domen/i);
  });
});
