import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadPropertyHealth,
  MIN_DESCRIPTION,
  MIN_PHOTOS,
  propertyHealth,
  type HealthInput,
  type HealthProperty,
} from "./health";

// Gotowość obiektu. Licznik jest widoczny na pulpicie i właściciel podejmuje
// po nim decyzje („mogę już przyjmować gości?"), więc kłamstwo w którąkolwiek
// stronę jest kosztowne: zawyżone daje fałszywe poczucie gotowości, zaniżone
// każe uzupełniać rzeczy niedostępne w jego planie.

// Atrapa Prismy dla `loadPropertyHealth`: zapisuje KSZTAŁT każdego zapytania
// (to jest właściwy kontrakt z bazą) i oddaje podstawione liczniki.
// `vi.mock` jest wynoszone nad ciało pliku, więc stan atrapy musi powstać
// równie wcześnie — inaczej fabryka sięga po niezainicjowane stałe.
const db = vi.hoisted(() => {
  const calls: { model: string; args: unknown }[] = [];
  const counts: Record<string, number> = {};
  const rows: { channex: { status: string } | null; site: { publishedAt: Date | null } | null } = {
    channex: null,
    site: null,
  };
  const counter = (model: string) => (args: unknown) => {
    calls.push({ model, args });
    return counts[model] ?? 0;
  };
  const finder = (model: string, get: () => unknown) => (args: unknown) => {
    calls.push({ model, args });
    return get();
  };
  return { calls, counts, rows, counter, finder };
});

const argsFor = (model: string) => db.calls.filter((c) => c.model === model).map((c) => c.args);

vi.mock("./db", () => ({
  prisma: {
    $transaction: (ops: unknown[]) => Promise.all(ops),
    photo: { count: db.counter("photo") },
    unitType: { count: db.counter("unitType") },
    unit: { count: db.counter("unit") },
    propertyFaq: { count: db.counter("propertyFaq") },
    icalFeed: { count: db.counter("icalFeed") },
    channexProperty: { findUnique: db.finder("channexProperty", () => db.rows.channex) },
    site: { findUnique: db.finder("site", () => db.rows.site) },
  },
}));

const COMPLETE: HealthProperty = {
  plan: "PRO",
  description: "x".repeat(MIN_DESCRIPTION),
  address: "Krupówki 1, Zakopane",
  terms: "Regulamin obiektu…",
  privacyPolicy: "Polityka prywatności…",
  arrivalInfo: "Klucze odbierasz w recepcji.",
  sellerName: "Willa Pod Dębem sp. z o.o.",
  sellerNip: "1234563218",
  sellerAddress: "Krupówki 1, Zakopane",
  bankAccount: "PL61109010140000071219812874",
  p24MerchantId: "12345",
  p24PosId: "12345",
  p24ApiKey: "klucz",
  p24Crc: "crc",
  p24Sandbox: true,
  syncMode: "ICAL",
  pricingMode: "BASIC",
  smartRateMarketId: "",
};

const COUNTS = {
  photoCount: MIN_PHOTOS,
  unitTypeCount: 2,
  activeUnitCount: 5,
  unpricedUnitTypeCount: 0,
  faqCount: 3,
  icalFeedCount: 1,
  channexActive: false,
  sitePublished: true,
};

const health = (
  property: Partial<HealthProperty> = {},
  counts: Partial<Omit<HealthInput, "property">> = {},
) => propertyHealth({ property: { ...COMPLETE, ...property }, ...COUNTS, ...counts });

/** Pozycja po kluczu — null, gdy w ogóle nie weszła do raportu. */
const item = (report: ReturnType<typeof health>, key: string) =>
  report.groups.flatMap((g) => g.items).find((i) => i.key === key) ?? null;
const keys = (report: ReturnType<typeof health>) =>
  report.groups.flatMap((g) => g.items).map((i) => i.key);

describe("komplet", () => {
  it("uzupełniony obiekt ma 100% i nic do zrobienia", () => {
    const report = health();

    expect(report.percent).toBe(100);
    expect(report.done).toBe(report.total);
    expect(report.missing).toEqual([]);
    expect(report.criticalMissing).toBe(0);
  });

  it("procent liczy się z pozycji, a nie z grup", () => {
    // grupy mają różną liczebność — liczenie po grupach zawyżałoby wagę
    // trzypozycyjnych „Płatności" nad sześciopozycyjną „Ofertą"
    const report = health({ address: "", terms: "" });

    expect(report.done).toBe(report.total - 2);
    expect(report.percent).toBe(Math.round(((report.total - 2) / report.total) * 100));
  });

  it("każda pozycja ma dokąd kliknąć i po co", () => {
    // lista bez odnośnika zostawia właściciela z „czegoś brakuje" i niczym więcej
    for (const i of health().groups.flatMap((g) => g.items)) {
      expect(i.href.startsWith("/admin"), i.key).toBe(true);
      expect(i.hint.length, i.key).toBeGreaterThan(10);
      expect(i.label.length, i.key).toBeGreaterThan(0);
    }
  });

  it("klucze pozycji są unikalne", () => {
    const all = keys(health());

    expect(new Set(all).size).toBe(all.length);
  });

  it("pusta grupa nie pokazuje się jako nagłówek bez treści", () => {
    // plan Free wycina całą „Widoczność"
    const report = health({ plan: "FREE" });

    expect(report.groups.map((g) => g.key)).not.toContain("widocznosc");
    expect(report.groups.every((g) => g.items.length > 0)).toBe(true);
  });
});

describe("oferta", () => {
  it("brak typów pokoi jest krytyczny", () => {
    const report = health({}, { unitTypeCount: 0 });

    expect(item(report, "unitTypes")).toMatchObject({ done: false, critical: true });
  });

  it("typ pokoju bez aktywnych jednostek nie sprzedaje ani jednej doby", () => {
    const report = health({}, { activeUnitCount: 0 });

    expect(item(report, "units")).toMatchObject({ done: false, critical: true });
  });

  it("jeden typ pokoju z ceną 0 psuje cały cennik", () => {
    const report = health({}, { unpricedUnitTypeCount: 1 });

    expect(item(report, "prices")!.done).toBe(false);
  });

  it("bez typów pokoi cennik nie jest „gotowy” tylko dlatego, że nie ma zer", () => {
    // zero typów daje zero typów bez ceny — naiwne sprawdzenie zaliczyłoby to
    const report = health({}, { unitTypeCount: 0, unpricedUnitTypeCount: 0 });

    expect(item(report, "prices")!.done).toBe(false);
  });

  it(`zdjęć poniżej ${MIN_PHOTOS} nie zalicza galerii`, () => {
    expect(item(health({}, { photoCount: MIN_PHOTOS - 1 }), "photos")!.done).toBe(false);
    expect(item(health({}, { photoCount: MIN_PHOTOS }), "photos")!.done).toBe(true);
  });

  it("zdjęcia i opis są zalecane, nie krytyczne", () => {
    // brak zdjęć szkodzi sprzedaży, ale nie blokuje rezerwacji — mieszanie
    // tego z blokadami rozmyłoby ostrzeżenie
    expect(item(health(), "photos")!.critical).toBe(false);
    expect(item(health(), "description")!.critical).toBe(false);
  });

  it("opis krótszy niż próg się nie liczy", () => {
    expect(item(health({ description: "x".repeat(MIN_DESCRIPTION - 1) }), "description")!.done).toBe(
      false,
    );
  });

  it("opis z samych spacji to pusty opis", () => {
    expect(item(health({ description: " ".repeat(MIN_DESCRIPTION + 5) }), "description")!.done).toBe(
      false,
    );
  });

  it("adres z samych spacji nie jest adresem", () => {
    expect(item(health({ address: "   " }), "address")!.done).toBe(false);
  });
});

describe("płatności i faktury", () => {
  it("brak kompletu kluczy P24 to pozycja krytyczna", () => {
    const report = health({ p24Crc: "" });

    expect(item(report, "p24")).toMatchObject({ done: false, critical: true });
  });

  it("nienumeryczny identyfikator sprzedawcy nie jest konfiguracją", () => {
    // pola są wypełnione, więc „niepuste" by przeszło — bramka i tak odrzuci
    expect(item(health({ p24MerchantId: "moj-sklep" }), "p24")!.done).toBe(false);
  });

  it("dane sprzedawcy wymagają nazwy, NIP-u i adresu naraz", () => {
    expect(item(health({ sellerNip: "" }), "seller")!.done).toBe(false);
    expect(item(health({ sellerName: "" }), "seller")!.done).toBe(false);
    expect(item(health({ sellerAddress: "" }), "seller")!.done).toBe(false);
    expect(item(health(), "seller")!.done).toBe(true);
  });

  it("konto bankowe jest osobną pozycją", () => {
    expect(item(health({ bankAccount: "" }), "bankAccount")!.done).toBe(false);
  });
});

describe("formalności", () => {
  it("regulamin i polityka prywatności są krytyczne", () => {
    const report = health({ terms: "", privacyPolicy: "" });

    expect(item(report, "terms")).toMatchObject({ done: false, critical: true });
    expect(item(report, "privacyPolicy")).toMatchObject({ done: false, critical: true });
  });

  it("informacje na przyjazd i FAQ są zalecane", () => {
    const report = health({ arrivalInfo: "" }, { faqCount: 0 });

    expect(item(report, "arrivalInfo")).toMatchObject({ done: false, critical: false });
    expect(item(report, "faq")).toMatchObject({ done: false, critical: false });
  });
});

describe("widoczność zależna od planu", () => {
  it("plan Free nie dostaje ani strony WWW, ani synchronizacji", () => {
    // te moduły są dla niego niedostępne — wypominanie ich obniżałoby
    // licznik za coś, czego nie da się zrobić
    const report = health({ plan: "FREE" });

    expect(item(report, "site")).toBeNull();
    expect(item(report, "channels")).toBeNull();
  });

  it("plan Standard dostaje stronę WWW i iCal", () => {
    const report = health({ plan: "STANDARD" });

    expect(item(report, "site")).not.toBeNull();
    expect(item(report, "channels")).not.toBeNull();
  });

  it("nieopublikowana strona to pozycja do zrobienia", () => {
    expect(item(health({}, { sitePublished: false }), "site")!.done).toBe(false);
  });

  it("plan Free ma mniej pozycji niż Pro, ale też może mieć 100%", () => {
    const free = health({ plan: "FREE" });
    const pro = health();

    expect(free.total).toBeLessThan(pro.total);
    expect(free.percent).toBe(100);
  });
});

describe("synchronizacja kanałów", () => {
  it("tryb iCal bez ani jednego kanału nie synchronizuje niczego", () => {
    // w ustawieniach wygląda na włączony — to jest właśnie pułapka
    expect(item(health({ syncMode: "ICAL" }, { icalFeedCount: 0 }), "channels")!.done).toBe(false);
  });

  it("tryb iCal z kanałem jest gotowy", () => {
    expect(item(health({ syncMode: "ICAL" }, { icalFeedCount: 1 }), "channels")!.done).toBe(true);
  });

  it("tryb Channex liczy się dopiero po aktywnym połączeniu", () => {
    expect(
      item(health({ syncMode: "CHANNEX" }, { channexActive: false, icalFeedCount: 5 }), "channels")!
        .done,
    ).toBe(false);
    expect(item(health({ syncMode: "CHANNEX" }, { channexActive: true }), "channels")!.done).toBe(
      true,
    );
  });

  it("wyłączona synchronizacja to pozycja niezrobiona, choćby kanały istniały", () => {
    // kanały zostały po wcześniejszym trybie, ale nic ich nie odpytuje
    expect(
      item(health({ syncMode: "OFF" }, { icalFeedCount: 2, channexActive: true }), "channels")!.done,
    ).toBe(false);
  });
});

describe("SmartRate", () => {
  it("obiekt na cenniku podstawowym nie jest pytany o rynek", () => {
    expect(item(health({ pricingMode: "BASIC" }), "smartRate")).toBeNull();
  });

  it("wyceny dynamiczne bez rynku to pozycja do uzupełnienia", () => {
    const report = health({ pricingMode: "SMARTRATE", smartRateMarketId: "" });

    expect(item(report, "smartRate")!.done).toBe(false);
  });

  it("z wybranym rynkiem pozycja jest zrobiona", () => {
    const report = health({ pricingMode: "SMARTRATE", smartRateMarketId: "mkt_zakopane" });

    expect(item(report, "smartRate")!.done).toBe(true);
  });

  it("tryb SmartRate w planie bez tej funkcji nie jest wypominany", () => {
    // po zejściu z Pro w bazie zostaje pricingMode=SMARTRATE, ale silnik
    // i tak liczy po staremu
    const report = health({ plan: "STANDARD", pricingMode: "SMARTRATE", smartRateMarketId: "" });

    expect(item(report, "smartRate")).toBeNull();
  });
});

describe("lista „co dalej”", () => {
  it("krytyczne idą przed zalecanymi", () => {
    const report = health({ terms: "" }, { photoCount: 0 });

    expect(report.missing.map((i) => i.key)).toEqual(["terms", "photos"]);
  });

  it("liczy tylko krytyczne braki", () => {
    const report = health({ terms: "", arrivalInfo: "" }, { photoCount: 0 });

    expect(report.missing).toHaveLength(3);
    expect(report.criticalMissing).toBe(1);
  });

  it("kolejność wewnątrz tej samej wagi zostaje z listy grup", () => {
    // stabilne sortowanie: właściciel widzi braki w kolejności paneli,
    // a nie w losowej
    const report = health({ address: "", terms: "", privacyPolicy: "" });

    expect(report.missing.map((i) => i.key)).toEqual(["address", "terms", "privacyPolicy"]);
  });
});

describe("dociąganie danych", () => {
  beforeEach(() => {
    db.calls.length = 0;
    for (const k of Object.keys(db.counts)) delete db.counts[k];
    db.rows.channex = null;
    db.rows.site = null;
  });

  it("wszystkie liczniki pyta o TEN obiekt", async () => {
    // pominięty filtr propertyId pokazałby właścicielowi cudze dane
    await loadPropertyHealth(7, COMPLETE);

    expect(argsFor("photo")).toEqual([{ where: { propertyId: 7 } }]);
    expect(argsFor("propertyFaq")).toEqual([{ where: { propertyId: 7 } }]);
    expect(argsFor("channexProperty")).toEqual([
      { where: { propertyId: 7 }, select: { status: true } },
    ]);
    expect(argsFor("site")).toEqual([
      { where: { propertyId: 7 }, select: { publishedAt: true } },
    ]);
  });

  it("liczy tylko AKTYWNE jednostki", async () => {
    // nieaktywna jednostka (remont, wyłączona z sprzedaży) nie daje dostępności
    await loadPropertyHealth(7, COMPLETE);

    expect(argsFor("unit")).toEqual([{ where: { unitType: { propertyId: 7 }, active: true } }]);
  });

  it("typy pokoi pyta dwa razy: wszystkie i te bez ceny", async () => {
    await loadPropertyHealth(7, COMPLETE);

    expect(argsFor("unitType")).toEqual([
      { where: { propertyId: 7 } },
      { where: { propertyId: 7, basePriceGr: { lte: 0 } } },
    ]);
  });

  it("kanały iCal szuka po jednostkach obiektu", async () => {
    await loadPropertyHealth(7, COMPLETE);

    expect(argsFor("icalFeed")).toEqual([
      { where: { unit: { unitType: { propertyId: 7 } } } },
    ]);
  });

  it("tylko aktywne połączenie Channex liczy się jako synchronizacja", async () => {
    db.rows.channex = { status: "PAUSED" };
    const paused = await loadPropertyHealth(7, { ...COMPLETE, syncMode: "CHANNEX" });
    expect(item(paused, "channels")!.done).toBe(false);

    db.rows.channex = { status: "ACTIVE" };
    const active = await loadPropertyHealth(7, { ...COMPLETE, syncMode: "CHANNEX" });
    expect(item(active, "channels")!.done).toBe(true);
  });

  it("brak rekordu Channex nie wywraca raportu", async () => {
    // obiekt, który nigdy nie dotknął integracji, nie ma tego wiersza
    db.rows.channex = null;

    expect(item(await loadPropertyHealth(7, { ...COMPLETE, syncMode: "CHANNEX" }), "channels")!.done)
      .toBe(false);
  });

  it("strona istniejąca, ale nigdy nieopublikowana, nie jest zrobiona", async () => {
    // wersja robocza w kreatorze nie jest widoczna dla nikogo z zewnątrz
    db.rows.site = { publishedAt: null };

    expect(item(await loadPropertyHealth(7, COMPLETE), "site")!.done).toBe(false);
  });

  it("opublikowana strona zalicza pozycję", async () => {
    db.rows.site = { publishedAt: new Date("2026-07-01") };

    expect(item(await loadPropertyHealth(7, COMPLETE), "site")!.done).toBe(true);
  });

  it("liczniki trafiają do raportu", async () => {
    db.counts.photo = MIN_PHOTOS;
    db.counts.unitType = 4;
    db.counts.unit = 9;
    db.counts.propertyFaq = 0;

    const report = await loadPropertyHealth(7, COMPLETE);

    expect(item(report, "photos")!.done).toBe(true);
    expect(item(report, "units")!.done).toBe(true);
    expect(item(report, "faq")!.done).toBe(false);
  });
});
