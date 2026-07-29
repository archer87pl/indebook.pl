import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuoteInput, RateDay } from "./provider";

// Pobieranie rekomendacji cen do cache'u. Ta funkcja nigdy nie stoi na
// ścieżce odpowiedzi — gość nie czeka na SmartRate — więc jej błędy są ciche
// dla gościa i muszą być głośne dla właściciela. Poza tym pilnuje trzech
// rzeczy: bramek planu i trybu, wygaszania duplikatów zleceń oraz widełek
// przekazywanych silnikowi, żeby nie oddał ceny oderwanej od cennika.

type UnitType = {
  id: number;
  basePriceGr: number;
  minPriceGr: number | null;
  maxPriceGr: number | null;
  propertyId: number;
  property: { plan: string; pricingMode: string; smartRateMarketId: string | null };
};

let unitType: UnitType | null = null;
let recentFetch: { id: number } | null = null;
let provider: { quote: (input: QuoteInput) => Promise<RateDay[]> } | null = null;
let quoteResult: RateDay[] | Error = [];

const quoteInputs: QuoteInput[] = [];
const upserts: { date: string; data: Record<string, unknown> }[] = [];
const propertyUpdates: Record<string, unknown>[] = [];
const deletes: Record<string, unknown>[] = [];
const coalesceQueries: Record<string, unknown>[] = [];

const afterCallbacks: (() => unknown)[] = [];
let afterThrows = false;

vi.mock("next/server", () => ({
  after: (cb: () => unknown) => {
    if (afterThrows) throw new Error("after() poza kontekstem żądania");
    afterCallbacks.push(cb);
  },
}));

vi.mock("../db", () => ({
  prisma: {
    unitType: { findUnique: async () => unitType },
    dynamicRate: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        coalesceQueries.push(where);
        return recentFetch;
      },
      upsert: async ({
        where,
        create,
      }: {
        where: { unitTypeId_date: { date: string } };
        create: Record<string, unknown>;
      }) => {
        upserts.push({ date: where.unitTypeId_date.date, data: create });
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        deletes.push(where);
        return { count: 0 };
      },
    },
    property: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        propertyUpdates.push(data);
      },
    },
  },
}));

vi.mock("./provider", () => ({ ratesProvider: () => provider }));

const { afterRates, invalidateRates, refreshRates } = await import("./refresh");

const NOW = new Date("2026-07-29T12:00:00Z");

function day(date: string, priceGr: number): RateDay {
  return {
    date,
    priceGr,
    clampedBy: null,
    demandScore: 0.5,
    drivers: ["weekend"],
    components: { base: priceGr },
  } as unknown as RateDay;
}

beforeEach(() => {
  unitType = {
    id: 7,
    basePriceGr: 20000,
    minPriceGr: null,
    maxPriceGr: null,
    propertyId: 3,
    property: { plan: "PRO", pricingMode: "SMARTRATE", smartRateMarketId: "mkt_gdansk" },
  };
  recentFetch = null;
  quoteResult = [day("2026-08-10", 25000), day("2026-08-11", 27000)];
  provider = {
    quote: async (input: QuoteInput) => {
      quoteInputs.push(input);
      if (quoteResult instanceof Error) throw quoteResult;
      return quoteResult;
    },
  };
  quoteInputs.length = 0;
  upserts.length = 0;
  propertyUpdates.length = 0;
  deletes.length = 0;
  coalesceQueries.length = 0;
  afterCallbacks.length = 0;
  afterThrows = false;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => vi.useRealTimers());

describe("refreshRates — bramki", () => {
  it("bez skonfigurowanego silnika nie robi nic", async () => {
    provider = null;
    expect(await refreshRates(7, "2026-08-10", "2026-08-12")).toBe(0);
  });

  it("nieznany typ pokoju nie robi nic", async () => {
    unitType = null;
    expect(await refreshRates(7, "2026-08-10", "2026-08-12")).toBe(0);
    expect(quoteInputs).toEqual([]);
  });

  it("obiekt w trybie reguł nie odpytuje silnika", async () => {
    unitType!.property.pricingMode = "RULES";
    expect(await refreshRates(7, "2026-08-10", "2026-08-12")).toBe(0);
    expect(quoteInputs).toEqual([]);
  });

  it("plan bez SmartRate nie odpytuje silnika", async () => {
    // po zejściu z Pro przestajemy płacić za odpytywanie silnika
    unitType!.property.plan = "STANDARD";
    expect(await refreshRates(7, "2026-08-10", "2026-08-12")).toBe(0);
    expect(quoteInputs).toEqual([]);
  });

  it("brak wybranego rynku nie odpytuje silnika", async () => {
    unitType!.property.smartRateMarketId = null;
    expect(await refreshRates(7, "2026-08-10", "2026-08-12")).toBe(0);
    expect(quoteInputs).toEqual([]);
  });
});

describe("refreshRates — wygaszanie duplikatów", () => {
  it("zakres odświeżony w ostatniej minucie jest pomijany", async () => {
    // kilka równoległych wejść gościa na tę samą stronę nie może zamienić się
    // w kilka zapytań do płatnego silnika
    recentFetch = { id: 1 };

    expect(await refreshRates(7, "2026-08-10", "2026-08-12")).toBe(0);
    expect(quoteInputs).toEqual([]);
  });

  it("okno wygaszania liczy się od teraz i obejmuje dokładnie zadany zakres", async () => {
    await refreshRates(7, "2026-08-10", "2026-08-12");

    const where = coalesceQueries[0] as {
      unitTypeId: number;
      date: { gte: string; lt: string };
      fetchedAt: { gt: Date };
    };
    expect(where.unitTypeId).toBe(7);
    expect(where.date).toEqual({ gte: "2026-08-10", lt: "2026-08-12" });
    expect(NOW.getTime() - where.fetchedAt.gt.getTime()).toBe(60_000);
  });
});

describe("refreshRates — zapytanie do silnika", () => {
  it("przekazuje rynek, cenę bazową i widełki", async () => {
    await refreshRates(7, "2026-08-10", "2026-08-12");

    expect(quoteInputs[0]).toMatchObject({
      marketId: "mkt_gdansk",
      basePriceGr: 20000,
      minPriceGr: 14000, // domyślne −30%
      maxPriceGr: 36000, // domyślne +80%
      from: "2026-08-10",
    });
  });

  it("widełki ustawione przez właściciela wygrywają z domyślnymi", async () => {
    unitType!.minPriceGr = 18000;
    unitType!.maxPriceGr = 30000;

    await refreshRates(7, "2026-08-10", "2026-08-12");

    expect(quoteInputs[0]).toMatchObject({ minPriceGr: 18000, maxPriceGr: 30000 });
  });

  it("widełka równa zeru jest szanowana, a nie podmieniana domyślną", async () => {
    // 0 jest wartością sensowną (sprzedaż od złotówki w dół nie ma sensu,
    // ale to decyzja właściciela) — `??` odróżnia ją od braku ustawienia
    unitType!.minPriceGr = 0;

    await refreshRates(7, "2026-08-10", "2026-08-12");

    expect(quoteInputs[0].minPriceGr).toBe(0);
  });

  it("koniec zakresu cofa o dobę — API liczy „do” włącznie, my dostajemy datę wyjazdu", async () => {
    // bez tej korekty silnik wyceniałby dobę, w której gościa już nie ma
    await refreshRates(7, "2026-08-10", "2026-08-12");

    expect(quoteInputs[0].to).toBe("2026-08-11");
  });
});

describe("refreshRates — zapis wyniku", () => {
  it("zapisuje każdą dobę i oddaje ich liczbę", async () => {
    expect(await refreshRates(7, "2026-08-10", "2026-08-12")).toBe(2);

    expect(upserts.map((u) => u.date)).toEqual(["2026-08-10", "2026-08-11"]);
    expect(upserts[0].data).toMatchObject({ unitTypeId: 7, priceGr: 25000, demandScore: 0.5 });
  });

  it("uzasadnienie ceny ląduje jako tekst — kolumny są tekstowe", async () => {
    await refreshRates(7, "2026-08-10", "2026-08-12");

    expect(upserts[0].data.drivers).toBe('["weekend"]');
    expect(upserts[0].data.components).toBe('{"base":25000}');
  });

  it("odnotowuje udaną synchronizację i czyści poprzedni błąd", async () => {
    await refreshRates(7, "2026-08-10", "2026-08-12");

    expect(propertyUpdates.at(-1)).toMatchObject({ smartRateError: "" });
    expect(propertyUpdates.at(-1)!.smartRateSyncedAt).toEqual(NOW);
  });

  it("pusta odpowiedź silnika nie jest błędem", async () => {
    quoteResult = [];

    expect(await refreshRates(7, "2026-08-10", "2026-08-12")).toBe(0);
    expect(propertyUpdates.at(-1)).toMatchObject({ smartRateError: "" });
  });
});

describe("refreshRates — awaria silnika", () => {
  it("komunikat trafia do panelu właściciela, a funkcja nie rzuca", async () => {
    // wycena zdegraduje się do reguł i gość nic nie zauważy; właściciel musi
    // zobaczyć, że silnik nie działa, inaczej sprzedawałby po starych cenach
    quoteResult = new Error("SmartRate: HTTP 503");

    await expect(refreshRates(7, "2026-08-10", "2026-08-12")).resolves.toBe(0);

    expect(propertyUpdates.at(-1)).toMatchObject({ smartRateError: "SmartRate: HTTP 503" });
    expect(propertyUpdates.at(-1)).not.toHaveProperty("smartRateSyncedAt");
  });

  it("długi komunikat jest przycinany do rozmiaru kolumny", async () => {
    quoteResult = new Error("x".repeat(500));

    await refreshRates(7, "2026-08-10", "2026-08-12");

    expect(String(propertyUpdates.at(-1)!.smartRateError)).toHaveLength(300);
  });

  it("nic nie zapisuje do cache'u, gdy silnik odmówił", async () => {
    quoteResult = new Error("timeout");

    await refreshRates(7, "2026-08-10", "2026-08-12");

    expect(upserts).toEqual([]);
  });
});

describe("afterRates", () => {
  it("w kontekście żądania odkłada odświeżenie na po odpowiedzi", async () => {
    await afterRates(7, "2026-08-10", "2026-08-12");

    // samo zlecenie jeszcze nic nie pobrało — gość nie czeka
    expect(afterCallbacks).toHaveLength(1);
    expect(quoteInputs).toEqual([]);

    await afterCallbacks[0]();
    expect(quoteInputs).toHaveLength(1);
  });

  it("poza kontekstem żądania (cron) odświeża bez after()", async () => {
    // after() rzuca w cronie i skryptach — bez tego zapasu horyzont cen
    // nigdy by się nie przebudował
    afterThrows = true;

    await expect(afterRates(7, "2026-08-10", "2026-08-12")).resolves.toBeUndefined();
    await vi.waitFor(() => expect(quoteInputs).toHaveLength(1));
  });

  it("awaria odświeżenia w tle nie wywraca wołającego", async () => {
    afterThrows = true;
    quoteResult = new Error("padło");

    await expect(afterRates(7, "2026-08-10", "2026-08-12")).resolves.toBeUndefined();
  });
});

describe("invalidateRates", () => {
  it("kasuje rekomendacje całego typu pokoju", async () => {
    // zmiana cennika, widełek albo rynku unieważnia wszystko, co silnik
    // policzył na starych danych
    await invalidateRates(7);

    expect(deletes).toEqual([{ unitTypeId: 7 }]);
  });
});
