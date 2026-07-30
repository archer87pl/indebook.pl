import { beforeEach, describe, expect, it, vi } from "vitest";
import { SmartRateClient } from "./smartrate";
import type { QuoteInput } from "./provider";

// Rozmowa HTTP z silnikiem cen. Kontrakt pola-po-polu pilnuje smartrate.test.ts
// (czyta contracts/smartrate-quote.json); tutaj chodzi o transport: klucz API
// w nagłówku, brak cache'owania odpowiedzi i komunikat błędu wyciągnięty
// z problem+json, bo to on ląduje w panelu właściciela.

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];

/** fetch dostaje obiekt URL, nie napis — zapisujemy jego postać tekstową. */

function respond(body: unknown, init: ResponseInit = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL | string, requestInit: RequestInit) => {
      calls.push({ url: String(url), init: requestInit });
      return new Response(typeof body === "string" ? body : JSON.stringify(body), init);
    })
  );
}

const BASE = "http://rezio-api:8080";
const KEY = "klucz-api-smartrate";

const client = (apiKey = KEY) => new SmartRateClient(BASE, apiKey);

const INPUT: QuoteInput = {
  marketId: "mkt_gdansk",
  basePriceGr: 20000,
  minPriceGr: 14000,
  maxPriceGr: 36000,
  from: "2026-08-10",
  to: "2026-08-12",
};

const bodyOf = (call: Call) => JSON.parse(call.init.body as string);
const headerOf = (call: Call, name: string) =>
  (call.init.headers as Record<string, string>)[name];

beforeEach(() => {
  calls = [];
});

describe("transport", () => {
  it("klucz API idzie w nagłówku, nigdy w adresie", async () => {
    // klucz w URL-u wyciekłby do logów serwera i proxy
    respond({ days: [] });

    await client().quote(INPUT);

    expect(calls[0].url).toBe(`${BASE}/v1/quote`);
    expect(calls[0].url).not.toContain(KEY);
    expect(headerOf(calls[0], "X-Api-Key")).toBe(KEY);
  });

  it("bez klucza nagłówek nie jest wysyłany — instalacja w sieci prywatnej", async () => {
    // SmartRate obok RezFlow w Dockerze nie musi mieć klucza; pusty nagłówek
    // API odrzuciłoby jako niepoprawny
    respond({ days: [] });

    await client("").quote(INPUT);

    expect(headerOf(calls[0], "X-Api-Key")).toBeUndefined();
  });

  it("odpowiedzi nie są cache'owane — ceny zmieniają się w czasie", async () => {
    respond({ days: [] });

    await client().quote(INPUT);

    expect(calls[0].init.cache).toBe("no-store");
  });

  it("żądanie ma limit czasu, żeby cron nie wisiał", async () => {
    respond({ days: [] });

    await client().quote(INPUT);

    expect(calls[0].init.signal).toBeDefined();
  });
});

describe("quote", () => {
  it("wysyła rynek, cenę bazową i widełki w złotówkach", async () => {
    // API liczy w złotówkach, my trzymamy grosze — pomyłka o 100×
    // dałaby ceny oderwane od cennika
    respond({ days: [] });

    await client().quote(INPUT);

    expect(bodyOf(calls[0])).toEqual({
      market_id: "mkt_gdansk",
      base_price: 200,
      min_price: 140,
      max_price: 360,
      from: "2026-08-10",
      to: "2026-08-12",
    });
  });

  it("mapuje zwrócone doby na nasz kształt", async () => {
    respond({
      days: [
        {
          date: "2026-08-10",
          recommended_price: 250,
          clamped_by: "min_price",
          demand_score: 72,
          demand_drivers: ["weekend"],
          components: { season: 1.1 },
        },
      ],
    });

    const days = await client().quote(INPUT);

    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({
      date: "2026-08-10",
      priceGr: 25000,
      clampedBy: "min",
      demandScore: 72,
    });
  });

  it("odpowiedź bez tablicy dób daje pustą listę, a nie wyjątek", async () => {
    // brak pokrycia degraduje wycenę do reguł — wyjątek wywróciłby stronę
    respond({});

    expect(await client().quote(INPUT)).toEqual([]);
  });

  it("doba bez ceny odrzuca CAŁĄ odpowiedź, wskazując brakujące pole", async () => {
    // Świadoma surowość: naruszenie kontraktu ma być głośne. Wycena zdegraduje
    // się do reguł (bo cache zostanie niekompletny), a komunikat z nazwą pola
    // trafi do panelu właściciela przez refreshRates.
    respond({ days: [{ date: "2026-08-10" }, { date: "2026-08-11", recommended_price: 250 }] });

    await expect(client().quote(INPUT)).rejects.toThrow(/recommended_price/);
  });

  it("doba bez daty też odrzuca odpowiedź", async () => {
    respond({ days: [{ recommended_price: 250 }] });

    await expect(client().quote(INPUT)).rejects.toThrow(/date/);
  });
});

describe("markets", () => {
  it("oddaje listę rynków do wyboru w panelu", async () => {
    respond({
      markets: [
        { id: "mkt_gdansk", name: "Gdańsk", type: "CityCoastal", voivodeship: "pomorskie" },
      ],
    });

    const markets = await client().markets();

    expect(calls[0].url).toBe(`${BASE}/v1/markets`);
    expect(markets).toEqual([
      { id: "mkt_gdansk", name: "Gdańsk", type: "CityCoastal", voivodeship: "pomorskie" },
    ]);
  });

  it("brakujące pola rynku schodzą do pustych napisów", async () => {
    // lista trafia do <select> w panelu — undefined wyrenderowałby się dosłownie
    respond({ markets: [{ id: "mkt_x" }] });

    expect(await client().markets()).toEqual([
      { id: "mkt_x", name: "", type: "", voivodeship: "" },
    ]);
  });

  it("odpowiedź bez listy rynków nie wywraca panelu", async () => {
    respond({});
    expect(await client().markets()).toEqual([]);
  });

  it("lista rynków nie jest wysyłana metodą POST", async () => {
    respond({ markets: [] });

    await client().markets();

    expect(calls[0].init.body).toBeUndefined();
  });
});

describe("błędy API", () => {
  it("komunikat bierze z pola detail (problem+json)", async () => {
    // to on ląduje w panelu właściciela jako smartRateError
    respond(
      { title: "Bad Request", detail: "Nieznany rynek: mkt_wymyslony" },
      { status: 400, statusText: "Bad Request" }
    );

    await expect(client().quote(INPUT)).rejects.toThrow(/Nieznany rynek: mkt_wymyslony/);
  });

  it("bez detail bierze title", async () => {
    respond({ title: "Unauthorized" }, { status: 401, statusText: "Unauthorized" });

    await expect(client().quote(INPUT)).rejects.toThrow(/401: Unauthorized/);
  });

  it("bez treści problem+json bierze status z odpowiedzi", async () => {
    respond("<html>502</html>", { status: 502, statusText: "Bad Gateway" });

    await expect(client().quote(INPUT)).rejects.toThrow(/502/);
  });

  it("komunikat niesie kod statusu, żeby dało się odróżnić awarię od odmowy", async () => {
    respond({ detail: "cokolwiek" }, { status: 503, statusText: "Service Unavailable" });

    await expect(client().quote(INPUT)).rejects.toThrow(/SmartRate 503/);
  });

  it("padnięta sieć wychodzi jako wyjątek do wołającego", async () => {
    // refreshRates go łapie i zapisuje przy obiekcie — klient nie ukrywa awarii
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      })
    );

    await expect(client().quote(INPUT)).rejects.toThrow(/ECONNREFUSED/);
  });
});
