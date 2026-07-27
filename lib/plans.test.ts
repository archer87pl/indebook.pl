import { describe, expect, it } from "vitest";
import {
  channelSyncFeatures,
  planDef,
  pricingPlanFeatures,
  sitePlanFeatures,
} from "./plans";

describe("channelSyncFeatures", () => {
  it("FREE bez kanałów", () =>
    expect(channelSyncFeatures("FREE")).toEqual({ ical: false, channex: false }));
  it("STANDARD: iCal, bez Channex", () =>
    expect(channelSyncFeatures("STANDARD")).toEqual({ ical: true, channex: false }));
  it("PRO: iCal i Channex", () =>
    expect(channelSyncFeatures("PRO")).toEqual({ ical: true, channex: true }));
});

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

describe("pricingPlanFeatures", () => {
  it("SmartRate tylko w planie Pro", () => {
    expect(pricingPlanFeatures("PRO").smartRate).toBe(true);
    expect(pricingPlanFeatures("STANDARD").smartRate).toBe(false);
    expect(pricingPlanFeatures("FREE").smartRate).toBe(false);
  });
});
