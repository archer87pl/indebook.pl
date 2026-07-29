import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RateSeason, UnitType } from "@prisma/client";

// Dyspozytor wyceny: jedno miejsce, przez które przechodzi KAŻDA cena
// widoczna dla gościa — wyszukiwarka, strona rezerwacji, zmiana terminu
// i push stawek do kanałów. Wybiera między silnikiem SmartRate a regułami
// obiektu, a najważniejsza zasada brzmi „wszystko albo nic": gość nigdy nie
// może zobaczyć ceny sklejonej z dwóch silników.

let property: { plan: string; pricingMode: string; smartRateMarketId: string | null } | null = null;
let rules: { kind: string; percent: number; param: number; active: boolean }[] = [];
let units: {
  reservations: { checkIn: string; checkOut: string }[];
  blocks: { startDate: string; endDate: string }[];
}[] = [];

let cached: { complete: boolean; stale: boolean; priceByDate: Map<string, number> } = {
  complete: false,
  stale: false,
  priceByDate: new Map(),
};
const refreshCalls: { unitTypeId: number; from: string; to: string }[] = [];
const ruleQueries: Record<string, unknown>[] = [];

vi.mock("./db", () => ({
  prisma: {
    property: { findUnique: async () => property },
    pricingRule: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        ruleQueries.push(where);
        return rules;
      },
    },
    unit: { findMany: async () => units },
  },
}));

vi.mock("./rates/cache", () => ({ cachedRates: async () => cached }));
vi.mock("./rates/refresh", () => ({
  afterRates: async (unitTypeId: number, from: string, to: string) => {
    refreshCalls.push({ unitTypeId, from, to });
  },
}));

const { nightlyRates, quoteStayDynamic, unitTypeOccupancy } = await import("./dynamic-pricing");

const UNIT_TYPE = {
  id: 7,
  propertyId: 3,
  basePriceGr: 20000,
  minStay: 1,
  seasons: [],
} as unknown as UnitType & { seasons: RateSeason[] };

const FROM = "2026-08-10";
const TO = "2026-08-13"; // 3 noce

beforeEach(() => {
  property = { plan: "PRO", pricingMode: "RULES", smartRateMarketId: null };
  rules = [];
  units = [];
  cached = { complete: false, stale: false, priceByDate: new Map() };
  refreshCalls.length = 0;
  ruleQueries.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 29, 12, 0, 0));
});

afterEach(() => vi.useRealTimers());

describe("quoteStayDynamic — bez cen dynamicznych", () => {
  it("bez reguł oddaje wycenę statyczną", async () => {
    const quote = await quoteStayDynamic(UNIT_TYPE, FROM, TO, 30);

    expect(quote.nightly.map((n) => n.priceGr)).toEqual([20000, 20000, 20000]);
    expect(quote.totalGr).toBe(60000);
    expect(quote.depositGr).toBe(18000);
  });

  it("pobiera wyłącznie reguły aktywne i o niezerowej korekcie", async () => {
    // reguła z zerowym procentem to reguła wyłączona — jej pobieranie
    // kosztowałoby zapytanie o obłożenie bez żadnego wpływu na cenę
    await quoteStayDynamic(UNIT_TYPE, FROM, TO, 30);

    expect(ruleQueries[0]).toEqual({ propertyId: 3, active: true, percent: { not: 0 } });
  });
});

describe("quoteStayDynamic — reguły obiektu", () => {
  it("nakłada korektę weekendową na właściwe noce", async () => {
    // 2026-08-14 to piątek, 15 sobota — dopłata dotyczy tylko ich
    rules = [{ kind: "WEEKEND", percent: 20, param: 0, active: true }];

    const quote = await quoteStayDynamic(UNIT_TYPE, "2026-08-13", "2026-08-16", 30);

    expect(quote.nightly).toEqual([
      { date: "2026-08-13", priceGr: 20000 }, // czwartek
      { date: "2026-08-14", priceGr: 24000 }, // piątek
      { date: "2026-08-15", priceGr: 24000 }, // sobota
    ]);
    expect(quote.totalGr).toBe(68000);
  });

  it("obłożenie liczy się tylko wtedy, gdy jest reguła, która go potrzebuje", async () => {
    rules = [{ kind: "WEEKEND", percent: 20, param: 0, active: true }];
    units = [{ reservations: [], blocks: [] }];

    await quoteStayDynamic(UNIT_TYPE, FROM, TO, 30);

    // brak reguły OCCUPANCY = brak zapytania o jednostki; to jest właśnie
    // ta oszczędność, dla której warunek istnieje
    expect(refreshCalls).toEqual([]);
  });

  it("zaliczka liczy się od ceny PO korektach", async () => {
    rules = [{ kind: "WEEKEND", percent: 50, param: 0, active: true }];

    const quote = await quoteStayDynamic(UNIT_TYPE, "2026-08-14", "2026-08-15", 30);

    expect(quote.totalGr).toBe(30000);
    expect(quote.depositGr).toBe(9000); // 30% z 30000, nie z 20000
  });
});

describe("quoteStayDynamic — tryb SmartRate", () => {
  beforeEach(() => {
    property = { plan: "PRO", pricingMode: "SMARTRATE", smartRateMarketId: "mkt_gdansk" };
  });

  const withRates = (prices: Record<string, number>) => {
    cached = {
      complete: true,
      stale: false,
      priceByDate: new Map(Object.entries(prices)),
    };
  };

  it("świeże i kompletne rekomendacje zastępują cennik", async () => {
    withRates({ "2026-08-10": 25000, "2026-08-11": 27000, "2026-08-12": 22000 });

    const quote = await quoteStayDynamic(UNIT_TYPE, FROM, TO, 30);

    expect(quote.nightly.map((n) => n.priceGr)).toEqual([25000, 27000, 22000]);
    expect(quote.totalGr).toBe(74000);
    expect(refreshCalls).toEqual([]); // nie ma czego odświeżać
  });

  it("brak choćby jednej nocy degraduje CAŁĄ wycenę do reguł", async () => {
    // cena sklejona z dwóch silników byłaby niespójna z tym, co widzi kanał
    cached = {
      complete: false,
      stale: false,
      priceByDate: new Map([["2026-08-10", 25000]]),
    };
    rules = [{ kind: "WEEKEND", percent: 20, param: 0, active: true }];

    const quote = await quoteStayDynamic(UNIT_TYPE, FROM, TO, 30);

    expect(quote.nightly.map((n) => n.priceGr)).toEqual([20000, 20000, 20000]);
    expect(refreshCalls).toEqual([{ unitTypeId: 7, from: FROM, to: TO }]);
  });

  it("rekomendacje nieświeże, ale kompletne, obsługują gościa i uruchamiają odświeżenie w tle", async () => {
    // gość nie może czekać na silnik — dostaje ostatnią znaną cenę,
    // a świeża dociąga się po odpowiedzi
    withRates({ "2026-08-10": 25000, "2026-08-11": 25000, "2026-08-12": 25000 });
    cached.stale = true;

    const quote = await quoteStayDynamic(UNIT_TYPE, FROM, TO, 30);

    expect(quote.totalGr).toBe(75000);
    expect(refreshCalls).toEqual([{ unitTypeId: 7, from: FROM, to: TO }]);
  });

  it("plan bez SmartRate wraca do reguł mimo ustawionego trybu", async () => {
    // po zejściu z Pro obiekt nie może dalej sprzedawać po cenach silnika
    property = { plan: "FREE", pricingMode: "SMARTRATE", smartRateMarketId: "mkt_gdansk" };
    withRates({ "2026-08-10": 99000, "2026-08-11": 99000, "2026-08-12": 99000 });

    const quote = await quoteStayDynamic(UNIT_TYPE, FROM, TO, 30);

    expect(quote.totalGr).toBe(60000);
  });

  it("brak wybranego rynku wraca do reguł", async () => {
    property = { plan: "PRO", pricingMode: "SMARTRATE", smartRateMarketId: null };
    withRates({ "2026-08-10": 99000, "2026-08-11": 99000, "2026-08-12": 99000 });

    expect((await quoteStayDynamic(UNIT_TYPE, FROM, TO, 30)).totalGr).toBe(60000);
  });

  it("usunięty obiekt nie wywraca wyceny", async () => {
    property = null;
    expect((await quoteStayDynamic(UNIT_TYPE, FROM, TO, 30)).totalGr).toBe(60000);
  });
});

describe("unitTypeOccupancy", () => {
  it("liczy odsetek zajętych jednostek per noc", async () => {
    units = [
      { reservations: [{ checkIn: "2026-08-10", checkOut: "2026-08-12" }], blocks: [] },
      { reservations: [], blocks: [] },
    ];

    const occupancy = await unitTypeOccupancy(7, FROM, TO);

    expect(occupancy.get("2026-08-10")).toBe(50);
    expect(occupancy.get("2026-08-11")).toBe(50);
    expect(occupancy.get("2026-08-12")).toBe(0); // doba wyjazdu jest wolna
  });

  it("blokada liczy się do obłożenia tak samo jak rezerwacja", async () => {
    units = [
      { reservations: [], blocks: [{ startDate: "2026-08-10", endDate: "2026-08-11" }] },
    ];

    expect((await unitTypeOccupancy(7, FROM, TO)).get("2026-08-10")).toBe(100);
  });

  it("typ pokoju bez jednostek daje zero, a nie dzielenie przez zero", async () => {
    units = [];

    const occupancy = await unitTypeOccupancy(7, FROM, TO);

    expect(occupancy.get("2026-08-10")).toBe(0);
    expect([...occupancy.values()].every(Number.isFinite)).toBe(true);
  });
});

describe("nightlyRates", () => {
  it("oddaje te same stawki, które widzi gość — przez ten sam dyspozytor", async () => {
    // kanał sprzedaje po naszej cenie; rozjazd oznaczałby, że gość z Booking
    // płaci inaczej niż gość z naszej strony
    property = { plan: "PRO", pricingMode: "SMARTRATE", smartRateMarketId: "mkt_gdansk" };
    cached = {
      complete: true,
      stale: false,
      priceByDate: new Map([
        ["2026-08-10", 25000],
        ["2026-08-11", 27000],
        ["2026-08-12", 22000],
      ]),
    };

    const rates = await nightlyRates(UNIT_TYPE, FROM, TO);

    expect([...rates.entries()]).toEqual([
      ["2026-08-10", 25000],
      ["2026-08-11", 27000],
      ["2026-08-12", 22000],
    ]);
  });

  it("pusty lub odwrócony zakres nie odpytuje bazy", async () => {
    expect(await nightlyRates(UNIT_TYPE, FROM, FROM)).toEqual(new Map());
    expect(await nightlyRates(UNIT_TYPE, TO, FROM)).toEqual(new Map());
    expect(ruleQueries).toEqual([]);
  });
});
