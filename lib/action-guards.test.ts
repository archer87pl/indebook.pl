import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Wartownicy akcji serwerowych — druga granica aplikacji, obok tras.
//
// Akcja serwerowa to osobny punkt wejścia: Next wystawia dla niej endpoint,
// który da się wywołać POST-em bez otwierania panelu. Wartownik ze STRONY nie
// chroni akcji — to, że formularz stoi za `requireOwner`, nie znaczy nic dla
// kogoś, kto woła akcję wprost.
//
// Dlatego reguła jest zerojedynkowa: każda eksportowana akcja albo sprawdza
// właściciela, albo jest wpisana niżej z powodem i z WŁASNYM dowodem prawa
// do danych (kod rezerwacji, limit prób).

const ROOT = join(import.meta.dirname, "..");
const PLIKI = [
  "lib/actions.ts",
  "lib/channex/channel-actions.ts",
  "lib/channex/sync-actions.ts",
  "lib/site-actions.ts",
];

const WARTOWNICY = ["requireOwner", "requireSuperadmin"];

type Akcja = { plik: string; nazwa: string; cialo: string };

/** Ciała funkcji rozcinamy po `export async function` — pliki są płaskie. */
function czytajAkcje(plik: string): { akcje: Akcja[]; zrodlo: string } {
  const zrodlo = readFileSync(join(ROOT, plik), "utf8");
  const czesci = zrodlo.split(/\n(?=export async function )/).slice(1);
  const akcje = czesci
    .map((cialo) => {
      const nazwa = /^export async function (\w+)/.exec(cialo)?.[1];
      return nazwa ? { plik, nazwa, cialo } : null;
    })
    .filter((a): a is Akcja => a !== null);
  return { akcje, zrodlo };
}

/**
 * Lokalne opakowania (`requireBuilder`, `requireChannel`…) same wołają
 * `requireOwner` — akcja, która ich używa, jest chroniona. Bez tego kroku
 * test wskazywałby kilkanaście fałszywych dziur.
 */
function opakowania(zrodlo: string): string[] {
  const lokalne = new Map<string, string>();
  for (const czesc of zrodlo.split(/\n(?=async function )/).slice(1)) {
    const nazwa = /^async function (\w+)/.exec(czesc)?.[1];
    if (nazwa) lokalne.set(nazwa, czesc.split(/\n(?=export |async function )/)[0]);
  }

  // Rozwiązujemy PRZECHODNIO: `requireSite` woła `requireBuilder`, a dopiero
  // ten `requireOwner`. Jeden poziom nie wystarczał — piętnaście akcji
  // kreatora strony wyglądało na niechronione.
  const chroniace = new Set<string>();
  for (let rosnie = true; rosnie; ) {
    rosnie = false;
    for (const [nazwa, cialo] of lokalne) {
      if (chroniace.has(nazwa)) continue;
      const znane = [...WARTOWNICY, ...chroniace];
      if (znane.some((g) => new RegExp(`\\b${g}\\s*\\(`).test(cialo))) {
        chroniace.add(nazwa);
        rosnie = true;
      }
    }
  }
  return [...chroniace];
}

const wszystkie = PLIKI.flatMap((p) => {
  const { akcje, zrodlo } = czytajAkcje(p);
  const dozwolone = [...WARTOWNICY, ...opakowania(zrodlo)];
  return akcje.map((a) => ({
    ...a,
    chroniona: dozwolone.some((g) => new RegExp(`\\b${g}\\s*\\(`).test(a.cialo)),
  }));
});

/**
 * Akcje bez wartownika właściciela — każda z powodem i z rodzajem własnego
 * zabezpieczenia. `kod` = wymaga kodu rezerwacji (sekret gościa),
 * `limit` = limit prób, `otwarta` = nie dotyka cudzych danych.
 */
const PUBLICZNE: Record<string, { obrona: "kod" | "limit" | "otwarta"; powod: string }> = {
  register: { obrona: "limit", powod: "zakładanie konta i obiektu — z definicji dostępne przed zalogowaniem" },
  login: { obrona: "limit", powod: "logowanie — z definicji dostępne przed zalogowaniem" },
  demoLogin: { obrona: "otwarta", powod: "wejście do konta pokazowego — dane demonstracyjne, nie należą do żadnego klienta" },
  logout: { obrona: "otwarta", powod: "wylogowanie kasuje własne cookie sesji i nie czyta żadnych danych" },
  requestPasswordReset: {
    obrona: "limit",
    powod: "prośba o reset hasła — wysyłka na adres z bazy, bez ujawniania, czy konto istnieje",
  },
  resetPassword: {
    obrona: "otwarta",
    powod:
      "ustawienie nowego hasła; dowodem prawa jest 256-bitowy token z maila — zgadywanie go jest poza zasięgiem, a udane użycie kasuje wszystkie tokeny i sesje użytkownika",
  },
  createReservation: {
    obrona: "limit",
    powod: "publiczny formularz rezerwacji — gość nie ma jeszcze żadnego konta",
  },
  findReservation: {
    obrona: "limit",
    powod: "wyszukanie rezerwacji po kodzie; limit prób blokuje zgadywanie kodów",
  },
  payDeposit: { obrona: "kod", powod: "opłacenie własnej rezerwacji — kod z linku w potwierdzeniu" },
  cancelByGuest: { obrona: "kod", powod: "anulowanie własnej rezerwacji z panelu gościa, bez konta w serwisie" },
  changeReservationDates: { obrona: "kod", powod: "zmiana terminu własnej rezerwacji z panelu gościa" },
  submitCheckIn: { obrona: "kod", powod: "meldunek online przed przyjazdem, z linku w wiadomości do gościa" },
  submitReview: { obrona: "kod", powod: "wystawienie opinii po pobycie, z linku wysłanego po wymeldowaniu" },
  sendGuestMessage: { obrona: "kod", powod: "wiadomość do recepcji z panelu gościa, bez konta w serwisie" },
  listMarkets: {
    obrona: "otwarta",
    powod: "lista rynków silnika cen — dane katalogowe dostawcy, bez związku z obiektem",
  },
};

describe("akcje panelu", () => {
  it("skan w ogóle coś znalazł", () => {
    // literówka w regule rozcinania plików dałaby pustą listę i zielony test
    expect(wszystkie.length).toBeGreaterThan(50);
  });

  it("każda akcja albo sprawdza właściciela, albo jest wpisana jako publiczna", () => {
    const dziury = wszystkie
      .filter((a) => !a.chroniona && !(a.nazwa in PUBLICZNE))
      .map((a) => `${a.plik}:${a.nazwa}`);

    expect(dziury).toEqual([]);
  });

  it("większość akcji jednak jest za wartownikiem", () => {
    // gdyby wykrywanie wartownika przestało działać, poprzedni test
    // wskazywałby wszystko jako brakujące — a ten złapie odwrotny błąd:
    // wykrywanie, które przepuszcza wszystko
    const chronione = wszystkie.filter((a) => a.chroniona).length;

    expect(chronione).toBeGreaterThan(wszystkie.length / 2);
  });
});

describe("akcje gościa", () => {
  const publiczne = wszystkie.filter((a) => a.nazwa in PUBLICZNE);
  const zObrona = (rodzaj: "kod" | "limit" | "otwarta") =>
    publiczne.filter((a) => PUBLICZNE[a.nazwa].obrona === rodzaj);

  it("akcja na cudzej rezerwacji wymaga kodu rezerwacji", () => {
    // kod jest sekretem gościa i jedynym dowodem prawa do tej rezerwacji;
    // akcja biorąca samo `id` z formularza pozwalałaby anulować cudzy pobyt
    const bezKodu = zObrona("kod")
      .filter((a) => !/str\(formData, "code"\)/.test(a.cialo))
      .map((a) => a.nazwa);

    expect(bezKodu).toEqual([]);
  });

  it("akcja na kodzie szuka rezerwacji PO kodzie, nie po identyfikatorze", () => {
    // odczyt kodu bez użycia go w zapytaniu byłby ozdobą
    const bezWyszukania = zObrona("kod")
      .filter((a) => !/where: \{ code \}/.test(a.cialo))
      .map((a) => a.nazwa);

    expect(bezWyszukania).toEqual([]);
  });

  it("akcja otwarta na świat ma limit prób", () => {
    // bez tego formularz logowania i rezerwacji jest darmowym narzędziem
    // do zgadywania haseł i zaśmiecania bazy
    const bezLimitu = zObrona("limit")
      .filter((a) => !/rateLimit/.test(a.cialo))
      .map((a) => a.nazwa);

    expect(bezLimitu).toEqual([]);
  });

  it("reguły powyżej mają na czym działać", () => {
    expect(zObrona("kod").length).toBeGreaterThan(3);
    expect(zObrona("limit").length).toBeGreaterThan(3);
  });
});

describe("lista wyjątków", () => {
  it("nie zawiera wpisów po nieistniejących akcjach", () => {
    // wyjątek po skasowanej akcji cicho usprawiedliwia jej imiennika
    const istniejace = new Set(wszystkie.map((a) => a.nazwa));
    const martwe = Object.keys(PUBLICZNE).filter((n) => !istniejace.has(n));

    expect(martwe).toEqual([]);
  });

  it("nie zawiera akcji, które i tak mają wartownika", () => {
    // taki wpis to ślad po refaktorze; zostawiony, przestaje cokolwiek znaczyć
    const zbedne = wszystkie
      .filter((a) => a.chroniona && a.nazwa in PUBLICZNE)
      .map((a) => a.nazwa);

    expect(zbedne).toEqual([]);
  });

  it("każdy wyjątek ma napisany powód", () => {
    for (const [nazwa, { powod }] of Object.entries(PUBLICZNE)) {
      expect(powod.length, nazwa).toBeGreaterThan(30);
    }
  });
});
