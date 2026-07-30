import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Zapytania o dostępność: `freeUnits` i `isUnitFree` (ścieżka rezerwacji)
// oraz `roomTypeAvailability` (to, co wysyłamy do kanałów). Kształt zapytania
// JEST tutaj kontraktem: pominięty warunek nie objawia się błędem, tylko
// pokojem sprzedanym dwa razy. Dlatego testy patrzą na `where`, nie na wynik.
// (Sam predykat kolizji ma testy w availability.test.ts, arytmetyka wolnych
//  miejsc — w channex/availability.test.ts.)

type Query = { where: Record<string, unknown>; orderBy?: unknown; select?: unknown };

const unitQueries: Query[] = [];
let units: unknown[] = [];
let conflictFound: unknown = null;

vi.mock("./db", () => ({
  prisma: {
    unit: {
      findMany: async (args: Query) => {
        unitQueries.push(args);
        return units;
      },
      findFirst: async (args: Query) => {
        unitQueries.push(args);
        return conflictFound;
      },
    },
  },
}));

const { freeUnits, isUnitFree } = await import("./availability");
// oba moduły importują lib/db, więc dzielą atrapę powyżej
const { roomTypeAvailability } = await import("./channex/availability");

const FROM = "2026-08-10";
const TO = "2026-08-13";
const NOW = new Date(2026, 6, 30, 12, 0, 0);

beforeEach(() => {
  unitQueries.length = 0;
  units = [{ id: 101 }, { id: 102 }];
  conflictFound = null;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => vi.useRealTimers());

describe("freeUnits", () => {
  it("szuka jednostek AKTYWNYCH, wolnych od rezerwacji i od blokad", async () => {
    // pominięcie `active` sprzedałoby pokój wyłączony z użytku (remont),
    // pominięcie blokad — pokój zajęty ręcznie albo przez kanał
    await freeUnits(7, FROM, TO);

    const where = unitQueries[0].where as {
      unitTypeId: number;
      active: boolean;
      reservations: { none: unknown };
      blocks: { none: { startDate: unknown; endDate: unknown } };
    };
    expect(where.unitTypeId).toBe(7);
    expect(where.active).toBe(true);
    expect(where.reservations.none).toBeDefined();
    expect(where.blocks.none).toEqual({
      startDate: { lt: TO },
      endDate: { gt: FROM },
    });
  });

  it("zwraca jednostki w stałej kolejności po id", async () => {
    // deterministyczny wybór: dwie równoległe rezerwacje nie mogą dostać
    // „losowo" tej samej jednostki tylko dlatego, że baza zmieniła kolejność
    await freeUnits(7, FROM, TO);

    expect(unitQueries[0].orderBy).toEqual({ id: "asc" });
  });

  it("kolizje liczy tym samym predykatem co reszta systemu", async () => {
    await freeUnits(7, FROM, TO);

    const none = (unitQueries[0].where as { reservations: { none: Record<string, unknown> } })
      .reservations.none;
    expect(none).toMatchObject({
      checkIn: { lt: TO },
      checkOut: { gt: FROM },
      OR: [{ status: "CONFIRMED" }, { status: "PENDING", expiresAt: { gt: NOW } }],
    });
  });

  it("wskazana rezerwacja jest wykluczana z kolizji (zmiana terminu)", async () => {
    await freeUnits(7, FROM, TO, undefined, 55);

    const none = (unitQueries[0].where as { reservations: { none: Record<string, unknown> } })
      .reservations.none;
    expect(none).toMatchObject({ id: { not: 55 } });
  });

  it("działa na przekazanym kliencie transakcji, a nie na globalnym", async () => {
    // to jest cała ochrona przed podwójną rezerwacją: sprawdzenie musi być
    // w tej samej transakcji, w której powstaje zapis
    const txQueries: Query[] = [];
    const tx = {
      unit: {
        findMany: async (args: Query) => {
          txQueries.push(args);
          return [{ id: 101 }];
        },
      },
    } as never;

    const result = await freeUnits(7, FROM, TO, tx);

    expect(txQueries).toHaveLength(1);
    expect(unitQueries).toEqual([]); // globalny klient nietknięty
    expect(result).toEqual([{ id: 101 }]);
  });
});

describe("isUnitFree", () => {
  it("wolna jednostka to brak znalezionej kolizji", async () => {
    conflictFound = null;
    expect(await isUnitFree(101, FROM, TO)).toBe(true);
  });

  it("znaleziona kolizja oznacza zajęte", async () => {
    conflictFound = { id: 101 };
    expect(await isUnitFree(101, FROM, TO)).toBe(false);
  });

  it("pyta o KONKRETNĄ jednostkę i sprawdza rezerwacje ORAZ blokady", async () => {
    await isUnitFree(101, FROM, TO);

    const where = unitQueries[0].where as { id: number; OR: Record<string, unknown>[] };
    expect(where.id).toBe(101);
    expect(where.OR).toHaveLength(2);
    expect(where.OR[0]).toHaveProperty("reservations");
    expect(where.OR[1]).toEqual({
      blocks: { some: { startDate: { lt: TO }, endDate: { gt: FROM } } },
    });
  });

  it("przy przywracaniu rezerwacji pomija ją samą", async () => {
    // inaczej własna rezerwacja blokowałaby swoje przywrócenie
    await isUnitFree(101, FROM, TO, 55);

    const some = (
      unitQueries[0].where as { OR: [{ reservations: { some: Record<string, unknown> } }, unknown] }
    ).OR[0].reservations.some;
    expect(some).toMatchObject({ id: { not: 55 } });
  });
});

// roomTypeAvailability chodzi po tym samym `prisma.unit.findMany` co freeUnits
// (oba moduły importują lib/db), więc korzysta z tej samej atrapy — wystarczy
// podstawić dane w kształcie, jakiego oczekuje.
describe("roomTypeAvailability (dane wysyłane do kanałów)", () => {
  const freeUnit = () => ({ reservations: [], blocks: [] });

  beforeEach(() => {
    units = [freeUnit(), freeUnit()];
  });

  it("liczy wolne miejsca dla każdej doby zakresu", async () => {
    const days = await roomTypeAvailability(7, FROM, TO);

    expect(days.map((d) => d.date)).toEqual(["2026-08-10", "2026-08-11", "2026-08-12"]);
    expect(days.every((d) => d.free === 2)).toBe(true);
  });

  it("bierze WYŁĄCZNIE blokady ręczne", async () => {
    // w trybie Channex blokady iCal nie istnieją, a rezerwacje z OTA są
    // zwykłymi rezerwacjami — liczenie ich dwa razy zamykałoby sprzedaż
    await roomTypeAvailability(7, FROM, TO);

    const blocks = (unitQueries.at(-1)!.select as { blocks: { where: Record<string, unknown> } })
      .blocks.where;
    expect(blocks).toMatchObject({ source: "MANUAL" });
  });

  it("pyta tylko o jednostki aktywne tego typu", async () => {
    await roomTypeAvailability(7, FROM, TO);

    expect(unitQueries.at(-1)!.where).toEqual({ unitTypeId: 7, active: true });
  });

  it("zajęta doba zmniejsza liczbę wolnych miejsc, doba wyjazdu już nie", async () => {
    units = [
      { reservations: [{ checkIn: "2026-08-10", checkOut: "2026-08-12" }], blocks: [] },
      freeUnit(),
    ];

    const days = await roomTypeAvailability(7, FROM, TO);
    const free = (date: string) => days.find((d) => d.date === date)!.free;

    expect(free("2026-08-10")).toBe(1);
    expect(free("2026-08-11")).toBe(1);
    expect(free("2026-08-12")).toBe(2); // gość wyjechał rano
  });

  it("blokada ręczna zajmuje miejsce tak samo jak rezerwacja", async () => {
    units = [
      { reservations: [], blocks: [{ startDate: "2026-08-10", endDate: "2026-08-11" }] },
      freeUnit(),
    ];

    const days = await roomTypeAvailability(7, FROM, TO);

    expect(days.find((d) => d.date === "2026-08-10")!.free).toBe(1);
  });

  it("pusty zakres nie produkuje żadnej doby", async () => {
    expect(await roomTypeAvailability(7, FROM, FROM)).toEqual([]);
  });
});
