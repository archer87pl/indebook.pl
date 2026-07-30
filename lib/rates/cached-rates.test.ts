import { beforeEach, describe, expect, it, vi } from "vitest";

// Odczyt rekomendacji z cache'u dla konkretnego zakresu. Sam rachunek pokrycia
// (complete/stale) ma testy w cache.test.ts — tutaj chodzi o zapytanie:
// zbyt szeroki zakres wciągałby doby spoza pobytu i zawyżał „pokrycie",
// czyli wycena szłaby po cenach silnika tam, gdzie ich nie ma.

type Query = { where: Record<string, unknown>; select?: unknown };

const queries: Query[] = [];
let rows: { date: string; priceGr: number; fetchedAt: Date }[] = [];

vi.mock("../db", () => ({
  prisma: {
    dynamicRate: {
      findMany: async (args: Query) => {
        queries.push(args);
        return rows;
      },
    },
  },
}));

const { cachedRates } = await import("./cache");

const NOW = new Date(2026, 6, 30, 12, 0, 0);
const fresh = () => new Date(NOW.getTime() - 3600_000);

beforeEach(() => {
  queries.length = 0;
  rows = [];
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

describe("cachedRates", () => {
  it("pyta o doby DOKŁADNIE z zakresu pobytu, bez doby wyjazdu", async () => {
    // `lt` na końcu, nie `lte`: doba wyjazdu nie jest sprzedawana, a wciągnięta
    // do rachunku udawałaby brakujące pokrycie albo je zawyżała
    await cachedRates(7, "2026-08-10", "2026-08-13");

    expect(queries[0].where).toEqual({
      unitTypeId: 7,
      date: { gte: "2026-08-10", lt: "2026-08-13" },
    });
  });

  it("komplet dób daje pełne pokrycie i mapę cen", async () => {
    rows = [
      { date: "2026-08-10", priceGr: 25000, fetchedAt: fresh() },
      { date: "2026-08-11", priceGr: 27000, fetchedAt: fresh() },
      { date: "2026-08-12", priceGr: 22000, fetchedAt: fresh() },
    ];

    const result = await cachedRates(7, "2026-08-10", "2026-08-13");

    expect(result.complete).toBe(true);
    expect(result.stale).toBe(false);
    expect(result.priceByDate.get("2026-08-11")).toBe(27000);
  });

  it("brak choćby jednej doby oznacza niepełne pokrycie", async () => {
    rows = [{ date: "2026-08-10", priceGr: 25000, fetchedAt: fresh() }];

    expect((await cachedRates(7, "2026-08-10", "2026-08-13")).complete).toBe(false);
  });

  it("pusty cache to brak pokrycia, a nie wyjątek", async () => {
    const result = await cachedRates(7, "2026-08-10", "2026-08-13");

    expect(result.complete).toBe(false);
    expect(result.priceByDate.size).toBe(0);
  });

  it("świeżość liczy się względem chwili odczytu", async () => {
    // po TTL wycena obsługuje gościa starą ceną i zleca odświeżenie w tle
    rows = [{ date: "2026-08-10", priceGr: 25000, fetchedAt: fresh() }];

    expect((await cachedRates(7, "2026-08-10", "2026-08-11")).stale).toBe(false);

    vi.setSystemTime(new Date(NOW.getTime() + 48 * 3600_000));
    expect((await cachedRates(7, "2026-08-10", "2026-08-11")).stale).toBe(true);
  });

  it("pobiera tylko pola potrzebne do wyceny", async () => {
    // uzasadnienie ceny (drivers, components) jest duże i przy wycenie zbędne
    await cachedRates(7, "2026-08-10", "2026-08-13");

    expect(queries[0].select).toEqual({ date: true, priceGr: true, fetchedAt: true });
  });
});
