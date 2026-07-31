import { beforeEach, describe, expect, it, vi } from "vitest";
import { bookingTransaction, NoUnitsError } from "./availability";

// Transakcja przydzielająca pokój. Jej jedynym zadaniem jest NIE dopuścić do
// dwóch rezerwacji na to samo łóżko, gdy dwoje gości kliknie „rezerwuję"
// w tej samej sekundzie.
//
// Dlaczego to nie jest teoretyczne: `freeUnits` sprawdza NIEOBECNOŚĆ kolidującej
// rezerwacji, a nieistniejącego wiersza nie da się zablokować — nie ma na czym
// postawić `FOR UPDATE`. Na domyślnym poziomie izolacji obie transakcje widzą
// ten sam ostatni wolny pokój i obie go zapisują.
//
// Czego ten test NIE sprawdza: prawdziwej równoległości. To wymagałoby dwóch
// połączeń do żywej bazy, więc tu pilnujemy KONTRAKTU (poziom izolacji jest
// żądany, konflikt tłumaczy się na „termin zajęty"), a samo zachowanie
// Postgresa bierzemy jako dane.

const wywolania: { opcje: unknown }[] = [];
let wynikTransakcji: unknown = "ok";
let bladTransakcji: unknown = null;

vi.mock("./db", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>, opcje: unknown) => {
      wywolania.push({ opcje });
      if (bladTransakcji) throw bladTransakcji;
      return fn({});
    },
  },
}));

/** Błąd Prismy niesie kod w polu `code` — tak samo jak prawdziwy. */
const bladZKodem = (code: string) => Object.assign(new Error(`błąd ${code}`), { code });

beforeEach(() => {
  wywolania.length = 0;
  wynikTransakcji = "ok";
  bladTransakcji = null;
});

describe("poziom izolacji", () => {
  it("transakcja rezerwacji idzie na SERIALIZABLE", () => {
    // to jedyne, co dzieli obiekt od podwójnej sprzedaży ostatniego pokoju
    return bookingTransaction(async () => wynikTransakcji).then(() => {
      expect(wywolania).toEqual([{ opcje: { isolationLevel: "Serializable" } }]);
    });
  });

  it("wynik z wnętrza transakcji wraca do wywołującego", async () => {
    const kod = await bookingTransaction(async () => "HO-ABC123");

    expect(kod).toBe("HO-ABC123");
  });
});

describe("przegrana w wyścigu", () => {
  it("konflikt zapisu (P2034) staje się „brak wolnych jednostek”", async () => {
    // dla gościa to nieodróżnialne od „ktoś był szybszy" — i tak samo się kończy
    bladTransakcji = bladZKodem("P2034");

    await expect(bookingTransaction(async () => "x")).rejects.toThrow(NoUnitsError);
  });

  it("kod błędu bazy 40001 też się liczy", async () => {
    // zapytania surowe wracają z surowym kodem Postgresa, bez tłumaczenia Prismy
    bladTransakcji = bladZKodem("40001");

    await expect(bookingTransaction(async () => "x")).rejects.toThrow(NoUnitsError);
  });

  it("komunikat pasuje do obsługi, która już jest w akcjach", async () => {
    // akcje łapią po `message === "NO_UNITS"` — zmiana treści rozłączyłaby
    // ten wyjątek od komunikatu „termin właśnie zajęty"
    bladTransakcji = bladZKodem("P2034");

    await expect(bookingTransaction(async () => "x")).rejects.toThrow("NO_UNITS");
  });
});

describe("inne błędy", () => {
  it("błąd niezwiązany z wyścigiem leci dalej nietknięty", async () => {
    // pomyłka w kodzie akcji nie może się przebrać za „termin zajęty" —
    // gość dostałby mylący komunikat, a błąd zniknąłby z logów
    bladTransakcji = bladZKodem("P2002");

    await expect(bookingTransaction(async () => "x")).rejects.toThrow("błąd P2002");
  });

  it("zwykły wyjątek bez kodu też leci dalej", async () => {
    bladTransakcji = new Error("baza padła");

    await expect(bookingTransaction(async () => "x")).rejects.toThrow("baza padła");
  });

  it("NO_UNITS rzucone przez samą akcję przechodzi bez zmian", async () => {
    // brak wolnych jednostek wykryty ODCZYTEM w transakcji — ta ścieżka
    // istniała wcześniej i ma działać dalej
    await expect(
      bookingTransaction(async () => {
        throw new NoUnitsError();
      }),
    ).rejects.toThrow("NO_UNITS");
  });
});
