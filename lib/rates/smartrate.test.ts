import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SmartRateClient, mapQuoteDay } from "./smartrate";

// Kształt odpowiedzi bierzemy z KONTRAKTU, nie z kopii wklejonej do testu —
// ten sam plik weryfikuje po swojej stronie test w C#. Dzięki temu zmiana
// kształtu w silniku od razu pokazuje, co poprawić w kliencie.
const contract = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "contracts", "smartrate-quote.json"), "utf8")
) as { days: Record<string, unknown>[] };

const raw = contract.days[0];

describe("mapQuoteDay", () => {
  it("przelicza złotówki na grosze", () => {
    expect(mapQuoteDay(raw).priceGr).toBe(23450);
  });

  it("skraca clamped_by do min/max", () => {
    expect(mapQuoteDay(raw).clampedBy).toBe("max");
    expect(mapQuoteDay({ ...raw, clamped_by: "min_price" }).clampedBy).toBe("min");
    expect(mapQuoteDay({ ...raw, clamped_by: null }).clampedBy).toBeNull();
  });

  it("mapuje mnożniki i drivery popytu", () => {
    const day = mapQuoteDay(raw);
    expect(day.components).toEqual({
      season: 1.35,
      dayOfWeek: 1.15,
      leadTime: 0.9,
      occupancy: 1.15,
      demand: 1.1,
    });
    expect(day.drivers).toEqual(["długi weekend"]);
    expect(day.demandScore).toBe(71);
  });

  it("odrzuca dobę bez daty lub bez ceny", () => {
    expect(() => mapQuoteDay({ ...raw, date: undefined })).toThrow();
    expect(() => mapQuoteDay({ ...raw, recommended_price: "dużo" })).toThrow();
  });
});

describe("SmartRateClient — adres bazowy", () => {
  it("przyjmuje adres w sieci prywatnej (SmartRate stoi obok RezFlow w Dockerze)", async () => {
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ markets: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    try {
      const client = new SmartRateClient("http://rezio-api:8080", "sekret");
      await expect(client.markets()).resolves.toEqual([]);
      expect(calls[0]).toBe("http://rezio-api:8080/v1/markets");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("odrzuca protokoły inne niż http/https", async () => {
    const client = new SmartRateClient("file:///etc/passwd", "");
    await expect(client.markets()).rejects.toThrow(/http\/https/);
  });
});
