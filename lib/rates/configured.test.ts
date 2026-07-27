import { afterEach, describe, expect, it } from "vitest";
import { ratesProvider, smartRateConfigured, stubProvider } from "./provider";
import { byStalestFirst } from "../jobs";

const ENV_KEYS = ["SMARTRATE_STUB", "SMARTRATE_URL", "SMARTRATE_API_KEY"] as const;
const original = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const key of ENV_KEYS) {
    const value = key in values ? values[key] : undefined;
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe("smartRateConfigured", () => {
  it("bez SMARTRATE_URL integracja jest nieskonfigurowana", () => {
    setEnv({});
    expect(smartRateConfigured()).toBe(false);
    expect(ratesProvider()).toBeNull();
  });

  it("stub liczy się jako konfiguracja (dev i testy)", () => {
    setEnv({ SMARTRATE_STUB: "1" });
    expect(smartRateConfigured()).toBe(true);
    expect(ratesProvider()).toBe(stubProvider);
  });

  it("sam adres wystarczy, klucz jest opcjonalny", () => {
    setEnv({ SMARTRATE_URL: "https://silnik.example" });
    expect(smartRateConfigured()).toBe(true);
    expect(ratesProvider()).not.toBeNull();
  });

  it("stub ma pierwszeństwo przed adresem — testy nie idą do sieci", () => {
    setEnv({ SMARTRATE_STUB: "1", SMARTRATE_URL: "https://silnik.example" });
    expect(ratesProvider()).toBe(stubProvider);
  });
});

describe("byStalestFirst", () => {
  const at = (iso: string) => [{ fetchedAt: new Date(iso) }];

  it("najdawniej odświeżane idą pierwsze", () => {
    const types = [
      { id: 1, dynamicRates: at("2026-07-20T10:00:00Z") },
      { id: 2, dynamicRates: at("2026-07-10T10:00:00Z") },
      { id: 3, dynamicRates: at("2026-07-25T10:00:00Z") },
    ];
    expect(byStalestFirst(types).map((t) => t.id)).toEqual([2, 1, 3]);
  });

  it("typy bez żadnej rekomendacji mają pierwszeństwo", () => {
    const types = [
      { id: 1, dynamicRates: at("2026-07-20T10:00:00Z") },
      { id: 2, dynamicRates: [] as { fetchedAt: Date }[] },
    ];
    expect(byStalestFirst(types).map((t) => t.id)).toEqual([2, 1]);
  });

  it("nie modyfikuje wejściowej tablicy", () => {
    const types = [
      { id: 1, dynamicRates: at("2026-07-20T10:00:00Z") },
      { id: 2, dynamicRates: at("2026-07-10T10:00:00Z") },
    ];
    byStalestFirst(types);
    expect(types.map((t) => t.id)).toEqual([1, 2]);
  });
});
