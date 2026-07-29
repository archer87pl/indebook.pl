import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Predykat kolizji terminów — jedno miejsce, które decyduje, czy pokój jest
// wolny. Jest wpinany w zapytania Prismy (freeUnits, isUnitFree, wyszukiwarka
// ofert, zmiana terminu), więc błąd tutaj rozlewa się na cały produkt:
// „<" zamiast „<=" to albo podwójna rezerwacja, albo zgubiona doba w sprzedaży.
vi.mock("./db", () => ({ prisma: {} }));

const { conflictingReservationWhere } = await import("./availability");

const NOW = new Date("2026-07-29T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => vi.useRealTimers());

describe("conflictingReservationWhere", () => {
  it("zakres jest domknięty od lewej, otwarty od prawej", () => {
    // [from, to): wyjazd jednego gościa w dniu przyjazdu drugiego to NIE kolizja,
    // bo pokój zwalnia się rano — inaczej sprzedalibyśmy o dobę mniej
    const where = conflictingReservationWhere("2026-08-10", "2026-08-14");

    expect(where.checkIn).toEqual({ lt: "2026-08-14" });
    expect(where.checkOut).toEqual({ gt: "2026-08-10" });
  });

  it("kolidują tylko potwierdzone i nieprzeterminowane wstępne", () => {
    const where = conflictingReservationWhere("2026-08-10", "2026-08-14");

    expect(where.OR).toEqual([
      { status: "CONFIRMED" },
      { status: "PENDING", expiresAt: { gt: NOW } },
    ]);
  });

  it("wstępna rezerwacja po wygaśnięciu blokady przestaje zajmować termin", () => {
    // porównanie idzie do bieżącej chwili, więc przesunięcie zegara zmienia próg
    const before = conflictingReservationWhere("2026-08-10", "2026-08-14");
    vi.setSystemTime(new Date(NOW.getTime() + 3600_000));
    const after = conflictingReservationWhere("2026-08-10", "2026-08-14");

    const expiresAt = (w: typeof before) =>
      (w.OR as { expiresAt?: { gt: Date } }[])[1].expiresAt!.gt;
    expect(expiresAt(after).getTime()).toBe(expiresAt(before).getTime() + 3600_000);
  });

  it("bez wskazania rezerwacji nie ma wykluczenia po id", () => {
    // brak klucza, a nie `id: undefined` — Prisma inaczej traktuje te dwa
    expect(conflictingReservationWhere("2026-08-10", "2026-08-14")).not.toHaveProperty("id");
  });

  it("zmiana terminu nie koliduje sama ze sobą", () => {
    // gość przesuwa własną rezerwację — jego stary termin trzeba pominąć,
    // inaczej system zgłosiłby zajęte przez niego samego
    const where = conflictingReservationWhere("2026-08-10", "2026-08-14", 501);
    expect(where.id).toEqual({ not: 501 });
  });
});
