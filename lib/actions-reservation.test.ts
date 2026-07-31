import { beforeEach, describe, expect, it, vi } from "vitest";

// Tworzenie rezerwacji przez gościa — najważniejsza akcja w produkcie.
// Wszystkie dane przychodzą z formularza publicznego, więc walidacja jest tu
// jedyną barierą, a wybór wolnej jednostki musi dziać się W TRANSAKCJI:
// dwóch gości klikających „Rezerwuję" w tej samej sekundzie nie może dostać
// tego samego pokoju. Kwota liczy się po stronie serwera, nigdy z formularza.

class RedirectError extends Error {
  constructor(readonly to: string) {
    super(`REDIRECT ${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: (cb: () => unknown) => void cb() }));

let guestLocale = "pl";
vi.mock("next-intl/server", () => ({
  getLocale: async () => guestLocale,
  getTranslations: async () => (k: string) => k,
}));

type UnitType = {
  id: number;
  propertyId: number;
  maxGuests: number;
  minStay: number;
  basePriceGr: number;
  seasons: unknown[];
  property: {
    id: number;
    name: string;
    depositPercent: number;
    suspended: boolean;
    syncMode: string;
    plan: string;
    pricingMode: string;
    smartRateMarketId: string | null;
  };
};

let unitType: UnitType | null = null;
let promo:
  | {
      id: number;
      percentOff: number;
      active: boolean;
      validFrom: string;
      validTo: string;
      maxUses: number;
      usedCount: number;
    }
  | null = null;
let freeUnitList: { id: number }[] = [];

const created: Record<string, unknown>[] = [];
const promoIncrements: number[] = [];
const ariCalls: { propertyId: number; unitTypeId: number }[] = [];
const mails: { to: string }[] = [];
const events: { message: string }[] = [];
const freeUnitCalls: { unitTypeId: number; from: string; to: string; inTx: boolean }[] = [];
const opcjeTransakcji: unknown[] = [];

vi.mock("./db", () => ({
  prisma: {
    unitType: { findUnique: async () => unitType },
    promoCode: { findUnique: async () => promo },
    property: { findUnique: async () => unitType?.property ?? null },
    pricingRule: { findMany: async () => [] },
    unit: { findMany: async () => freeUnitList },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>, opcje?: unknown) => {
      opcjeTransakcji.push(opcje);
      return fn({
        promoCode: {
          update: async ({ where }: { where: { id: number } }) => {
            promoIncrements.push(where.id);
          },
        },
        reservation: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            created.push(data);
            return data;
          },
        },
        unit: { findMany: async () => freeUnitList },
      });
    },
  },
}));

vi.mock("./availability", async (importOriginal) => {
  const original = await importOriginal<typeof import("./availability")>();
  return {
    ...original,
    freeUnits: async (unitTypeId: number, from: string, to: string, tx?: unknown) => {
      freeUnitCalls.push({ unitTypeId, from, to, inTx: tx !== undefined });
      return freeUnitList;
    },
    isUnitFree: async () => true,
  };
});

vi.mock("./mailer", () => ({ sendMail: async (m: { to: string }) => void mails.push(m) }));
vi.mock("./sms", () => ({ sendSms: async () => {} }));
vi.mock("./log", () => ({
  logEvent: async (e: { message: string }) => void events.push(e),
}));
let limitOsiagniety = false;
vi.mock("./rate-limit", () => ({
  rateLimitOrRedirect: async (_a: string, _l: number, _w: number, redirectTo: string) => {
    if (limitOsiagniety) throw new RedirectError(redirectTo);
  },
  rateLimit: async () => true,
}));
vi.mock("./channex/enqueue-helpers", () => ({
  afterAri: async (propertyId: number, unitTypeId: number) => {
    ariCalls.push({ propertyId, unitTypeId });
  },
  syncUnitRange: async () => {},
}));
vi.mock("./ical", () => ({ syncIcalFeed: async () => ({ ok: true, imported: 0 }) }));
vi.mock("./photos", () => ({ savePhotoFile: async () => "", deletePhotoFile: async () => {} }));
vi.mock("./auth", () => ({
  requireOwner: async () => ({ user: { id: 5 }, property: { id: 3 } }),
  requireSuperadmin: async () => ({ id: 1 }),
  getSessionUser: async () => null,
  createSession: async () => {},
  destroySession: async () => {},
  SESSION_COOKIE: "rezflow_session",
}));

const { createReservation } = await import("./actions");

const TODAY = new Date(2026, 6, 30, 12, 0, 0);
const FROM = "2026-08-10";
const TO = "2026-08-13"; // 3 noce

const VALID = {
  unitTypeId: "7",
  from: FROM,
  to: TO,
  guests: "2",
  guestName: "Anna Kowalska",
  email: "anna@example.com",
  phone: "+48600100200",
  nip: "",
  promo: "",
  notes: "",
  rodo: "on",
};

const form = (entries: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};

async function target(run: Promise<void>): Promise<string> {
  try {
    await run;
    throw new Error("akcja nie przekierowała");
  } catch (e) {
    if (e instanceof RedirectError) return decodeURIComponent(e.to);
    throw e;
  }
}

beforeEach(() => {
  guestLocale = "pl";
  limitOsiagniety = false;
  unitType = {
    id: 7,
    propertyId: 3,
    maxGuests: 4,
    minStay: 1,
    basePriceGr: 20000,
    seasons: [],
    property: {
      id: 3,
      name: "Willa Pod Dębem",
      depositPercent: 30,
      suspended: false,
      syncMode: "OFF",
      plan: "STANDARD",
      pricingMode: "RULES",
      smartRateMarketId: null,
    },
  };
  promo = null;
  freeUnitList = [{ id: 101 }, { id: 102 }];
  created.length = 0;
  promoIncrements.length = 0;
  ariCalls.length = 0;
  mails.length = 0;
  events.length = 0;
  freeUnitCalls.length = 0;
  opcjeTransakcji.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});

describe("createReservation — limit prób", () => {
  it("nadmiar prób z jednego adresu odbija się od limitu", async () => {
    // rezerwacja PENDING BLOKUJE dostępność do czasu wygaśnięcia, więc bez
    // limitu jeden skrypt przytrzymuje wszystkie pokoje obiektu i odcina
    // prawdziwe rezerwacje
    limitOsiagniety = true;

    const to = await target(createReservation(form(VALID)));

    expect(to).toContain("tooManyRequests");
    expect(created).toEqual([]);
  });

  it("komunikat idzie kodem, nie polskim zdaniem", async () => {
    // stronę ogląda gość w swoim języku — gotowe zdanie trafiłoby do Niemca
    // po polsku
    limitOsiagniety = true;

    const to = await target(createReservation(form(VALID)));

    expect(to).not.toContain("Za dużo");
  });
});

describe("createReservation — udana rezerwacja", () => {
  it("zapisuje rezerwację wstępną i odsyła gościa na jej stronę", async () => {
    const to = await target(createReservation(form(VALID)));

    expect(to).toMatch(/^\/r\/HO-/);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      unitId: 101,
      checkIn: FROM,
      checkOut: TO,
      guests: 2,
      guestName: "Anna Kowalska",
      status: "PENDING",
      source: "ONLINE",
    });
  });

  it("wybór pokoju idzie transakcją SERIALIZABLE", async () => {
    // domyślny poziom izolacji pozwala dwóm równoczesnym rezerwacjom zobaczyć
    // ten sam ostatni wolny pokój i obu go zapisać
    await target(createReservation(form(VALID)));

    expect(opcjeTransakcji).toEqual([{ isolationLevel: "Serializable" }]);
  });

  it("kwota i zaliczka liczą się na serwerze, a nie z formularza", async () => {
    // pole z kwotą w formularzu byłoby wektorem rezerwacji za złotówkę
    await target(createReservation(form({ ...VALID, totalGr: "1", depositGr: "1" })));

    expect(created[0]).toMatchObject({ totalGr: 60000, depositGr: 18000 }); // 3 × 200 zł, 30%
  });

  it("rezerwacja wstępna wygasa po pół godziny", async () => {
    // bez terminu nieopłacona rezerwacja blokowałaby termin na zawsze
    await target(createReservation(form(VALID)));

    const expiresAt = created[0].expiresAt as Date;
    expect(expiresAt.getTime() - TODAY.getTime()).toBe(30 * 60 * 1000);
  });

  it("kod rezerwacji ma format systemowy", async () => {
    await target(createReservation(form(VALID)));

    expect(String(created[0].code)).toMatch(/^HO-[A-Z0-9]{6,}$/);
  });

  it("zapamiętuje język, w którym gość rezerwował", async () => {
    // w tym języku pójdą do niego wszystkie późniejsze wiadomości
    guestLocale = "de";

    await target(createReservation(form(VALID)));

    expect(created[0]).toMatchObject({ locale: "de" });
  });

  it("wysyła gościowi wiadomość o oczekującej zaliczce i zapisuje zdarzenie", async () => {
    await target(createReservation(form(VALID)));

    expect(mails[0].to).toBe("anna@example.com");
    expect(events[0].message).toContain("Nowa rezerwacja");
  });

  it("obiekt w trybie Channex dostaje odświeżenie dostępności w kanałach", async () => {
    // inaczej Booking sprzedałby ten sam pokój drugi raz
    unitType!.property.syncMode = "CHANNEX";

    await target(createReservation(form(VALID)));

    expect(ariCalls).toEqual([{ propertyId: 3, unitTypeId: 7 }]);
  });

  it("obiekt bez synchronizacji nie zleca pushu", async () => {
    await target(createReservation(form(VALID)));
    expect(ariCalls).toEqual([]);
  });
});

describe("createReservation — wyścig o ten sam pokój", () => {
  it("wolną jednostkę wybiera W TRANSAKCJI, nie przed nią", async () => {
    // to jest cała ochrona przed podwójną rezerwacją: sprawdzenie i zapis
    // muszą być w jednej transakcji, inaczej dwóch gości dostanie ten pokój
    await target(createReservation(form(VALID)));

    expect(freeUnitCalls).toHaveLength(1);
    expect(freeUnitCalls[0]).toMatchObject({ unitTypeId: 7, from: FROM, to: TO, inTx: true });
  });

  it("gdy termin zniknął w trakcie, gość dostaje zrozumiały komunikat", async () => {
    freeUnitList = [];

    const to = await target(createReservation(form(VALID)));

    expect(to).toContain("datesJustTaken");
    expect(created).toEqual([]);
  });
});

describe("createReservation — walidacja formularza", () => {
  it("odwrócony lub zerowy zakres dat jest odrzucany", async () => {
    for (const [from, to] of [
      [TO, FROM],
      [FROM, FROM],
    ]) {
      const target_ = await target(createReservation(form({ ...VALID, from, to })));
      expect(target_).toContain("invalidRange");
    }
    expect(created).toEqual([]);
  });

  it("data w formacie innym niż ISO jest odrzucana", async () => {
    for (const from of ["10.08.2026", "2026-8-10", "wczoraj", ""]) {
      expect(await target(createReservation(form({ ...VALID, from })))).toContain("invalidRange");
    }
  });

  it("przyjazd w przeszłości jest odrzucany", async () => {
    const to = await target(
      createReservation(form({ ...VALID, from: "2026-07-29", to: "2026-08-01" }))
    );

    expect(to).toContain("pastArrival");
    expect(created).toEqual([]);
  });

  it("liczba gości musi być dodatnią liczbą całkowitą", async () => {
    for (const guests of ["0", "-1", "abc", "", "1.5"]) {
      expect(
        await target(createReservation(form({ ...VALID, guests }))),
        `guests=${guests}`
      ).toContain("guestsRequired");
    }
  });

  it("więcej gości niż mieści pokój jest odrzucane, z podaniem limitu", async () => {
    const to = await target(createReservation(form({ ...VALID, guests: "5" })));

    expect(to).toContain("maxGuests");
    expect(to).toContain("4"); // limit trafia do komunikatu
  });

  it("imię krótsze niż trzy znaki jest odrzucane", async () => {
    expect(await target(createReservation(form({ ...VALID, guestName: "Ab" })))).toContain(
      "nameRequired"
    );
  });

  it("niepoprawny e-mail jest odrzucany", async () => {
    for (const email of ["", "anna", "anna@", "anna@example", "a b@example.pl"]) {
      expect(
        await target(createReservation(form({ ...VALID, email }))),
        `email=${email}`
      ).toContain("emailInvalid");
    }
  });

  it("bez zgody na przetwarzanie danych rezerwacja nie powstaje", async () => {
    for (const rodo of ["", "off", "true"]) {
      expect(await target(createReservation(form({ ...VALID, rodo })))).toContain("rodoRequired");
    }
    expect(created).toEqual([]);
  });

  it("nieznany typ pokoju odsyła na stronę główną", async () => {
    unitType = null;
    expect(await target(createReservation(form(VALID)))).toBe("/");
  });

  it("niepoprawny identyfikator typu pokoju odsyła na stronę główną", async () => {
    for (const unitTypeId of ["0", "-3", "abc"]) {
      expect(await target(createReservation(form({ ...VALID, unitTypeId })))).toBe("/");
    }
  });

  it("obiekt zawieszony nie przyjmuje rezerwacji", async () => {
    unitType!.property.suspended = true;

    const to = await target(createReservation(form(VALID)));

    expect(to).toContain("propertySuspended");
    expect(created).toEqual([]);
  });

  it("pobyt krótszy niż minimum jest odrzucany, z podaniem minimum", async () => {
    unitType!.minStay = 5;

    const to = await target(createReservation(form(VALID)));

    expect(to).toContain("minStay");
    expect(to).toContain("5");
  });
});

describe("createReservation — kod promocyjny", () => {
  const activePromo = {
    id: 41,
    percentOff: 10,
    active: true,
    validFrom: "",
    validTo: "",
    maxUses: 0,
    usedCount: 0,
  };

  it("poprawny kod obniża kwotę i zaliczkę, i zwiększa licznik użyć", async () => {
    promo = { ...activePromo };

    await target(createReservation(form({ ...VALID, promo: "wakacje10" })));

    expect(created[0]).toMatchObject({
      totalGr: 54000, // 60000 − 10%
      discountGr: 6000,
      depositGr: 16200, // 30% z kwoty PO rabacie
      promoCode: "WAKACJE10", // zapisany wielkimi literami
    });
    expect(promoIncrements).toEqual([41]);
  });

  it("licznik użyć rośnie w tej samej transakcji co rezerwacja", async () => {
    // inkrement poza transakcją pozwalałby przekroczyć limit użyć
    // przy równoległych rezerwacjach
    promo = { ...activePromo, maxUses: 1 };

    await target(createReservation(form({ ...VALID, promo: "wakacje10" })));

    expect(promoIncrements).toEqual([41]);
    expect(created).toHaveLength(1);
  });

  it("nieznany kod jest odrzucany, zamiast po cichu nie działać", async () => {
    // gość, który dostał kod od właściciela, musi wiedzieć, że nie zadziałał
    promo = null;

    const to = await target(createReservation(form({ ...VALID, promo: "NIEISTNIEJE" })));

    expect(to).toContain("promoInvalid");
    expect(created).toEqual([]);
  });

  it("kod wyłączony nie działa", async () => {
    promo = { ...activePromo, active: false };
    expect(await target(createReservation(form({ ...VALID, promo: "X" })))).toContain(
      "promoInvalid"
    );
  });

  it("kod przed okresem ważności i po nim nie działa", async () => {
    promo = { ...activePromo, validFrom: "2026-09-01" };
    expect(await target(createReservation(form({ ...VALID, promo: "X" })))).toContain(
      "promoInvalid"
    );

    promo = { ...activePromo, validTo: "2026-07-01" };
    expect(await target(createReservation(form({ ...VALID, promo: "X" })))).toContain(
      "promoInvalid"
    );
  });

  it("kod wyczerpany nie działa", async () => {
    promo = { ...activePromo, maxUses: 5, usedCount: 5 };
    expect(await target(createReservation(form({ ...VALID, promo: "X" })))).toContain(
      "promoInvalid"
    );
  });

  it("kod bez limitu użyć działa niezależnie od licznika", async () => {
    promo = { ...activePromo, maxUses: 0, usedCount: 999 };

    await target(createReservation(form({ ...VALID, promo: "X" })));

    expect(created).toHaveLength(1);
  });

  it("brak kodu to rezerwacja bez rabatu, bez pustego wpisu", async () => {
    await target(createReservation(form(VALID)));

    expect(created[0]).toMatchObject({ discountGr: 0, promoCode: "" });
    expect(promoIncrements).toEqual([]);
  });
});
