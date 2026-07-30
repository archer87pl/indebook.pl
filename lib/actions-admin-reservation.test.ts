import { beforeEach, describe, expect, it, vi } from "vitest";

// Panel recepcji: ręczna rezerwacja, jej edycja i zmiana statusu. Wszystkie
// trzy przechodzą przez bramkę właściciela i wszystkie trzy muszą pilnować
// tego samego co ścieżka gościa: termin sprawdzany W TRANSAKCJI i nigdy
// rezerwacja na cudzy obiekt. Recepcja może nadpisać cenę — to jedyne miejsce
// w produkcie, gdzie kwota z formularza wygrywa z cennikiem.

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
vi.mock("next-intl/server", () => ({
  getLocale: async () => "pl",
  getTranslations: async () => (k: string) => k,
}));

const owner = {
  user: { id: 5 },
  property: { id: 3, name: "Willa Pod Dębem", depositPercent: 30 },
};
vi.mock("./auth", () => ({
  requireOwner: async () => owner,
  requireSuperadmin: async () => ({ id: 1 }),
  getSessionUser: async () => owner.user,
  createSession: async () => {},
  destroySession: async () => {},
  SESSION_COOKIE: "rezflow_session",
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
    depositPercent: number;
    plan: string;
    pricingMode: string;
    smartRateMarketId: string | null;
  };
};

type Reservation = {
  id: number;
  code: string;
  unitId: number;
  status: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  totalGr: number;
  email: string;
  phone: string;
  locale: string;
  unit: { unitTypeId: number; unitType: { propertyId: number; name: string } };
};

let unitType: UnitType | null = null;
let reservation: Reservation | null = null;
let freeUnitList: { id: number }[] = [];
let unitFree = true;

const created: Record<string, unknown>[] = [];
const updates: { id: number; data: Record<string, unknown> }[] = [];
const freeUnitCalls: { from: string; to: string; inTx: boolean; exclude?: number }[] = [];
const syncCalls: { unitId: number; from: string; to: string }[] = [];
const mails: { to: string }[] = [];
const smses: { to: string }[] = [];

vi.mock("./db", () => ({
  prisma: {
    unitType: { findUnique: async () => unitType },
    reservation: {
      findUnique: async () => reservation,
      update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
        updates.push({ id: where.id, data });
        return data;
      },
    },
    property: { findUnique: async () => unitType?.property ?? null },
    pricingRule: { findMany: async () => [] },
    unit: { findMany: async () => freeUnitList },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        reservation: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            created.push(data);
            return { ...data, locale: "pl" };
          },
          update: async ({
            where,
            data,
          }: {
            where: { id: number };
            data: Record<string, unknown>;
          }) => {
            updates.push({ id: where.id, data });
            return data;
          },
        },
        unit: { findMany: async () => freeUnitList },
      }),
  },
}));

vi.mock("./availability", async (importOriginal) => {
  const original = await importOriginal<typeof import("./availability")>();
  return {
    ...original,
    freeUnits: async (
      _unitTypeId: number,
      from: string,
      to: string,
      tx?: unknown,
      exclude?: number
    ) => {
      freeUnitCalls.push({ from, to, inTx: tx !== undefined, exclude });
      return freeUnitList;
    },
    isUnitFree: async () => unitFree,
  };
});

vi.mock("./mailer", () => ({ sendMail: async (m: { to: string }) => void mails.push(m) }));
vi.mock("./sms", () => ({ sendSms: async (s: { to: string }) => void smses.push(s) }));
vi.mock("./log", () => ({ logEvent: async () => {} }));
vi.mock("./rate-limit", () => ({ rateLimitOrRedirect: async () => {}, rateLimit: async () => true }));
vi.mock("./channex/enqueue-helpers", () => ({
  afterAri: async () => {},
  syncUnitRange: async (unitId: number, from: string, to: string) => {
    syncCalls.push({ unitId, from, to });
  },
}));
vi.mock("./ical", () => ({ syncIcalFeed: async () => ({ ok: true, imported: 0 }) }));
vi.mock("./photos", () => ({ savePhotoFile: async () => "", deletePhotoFile: async () => {} }));

const { adminCreateReservation, adminSetStatus, adminUpdateReservation } = await import("./actions");

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

/** adminSetStatus kończy się przekierowaniem, ale przy złych danych — return. */
async function maybeTarget(run: Promise<void>): Promise<string | null> {
  try {
    await run;
    return null;
  } catch (e) {
    if (e instanceof RedirectError) return decodeURIComponent(e.to);
    throw e;
  }
}

beforeEach(() => {
  unitType = {
    id: 7,
    propertyId: 3,
    maxGuests: 4,
    minStay: 1,
    basePriceGr: 20000,
    seasons: [],
    property: {
      id: 3,
      depositPercent: 30,
      plan: "STANDARD",
      pricingMode: "RULES",
      smartRateMarketId: null,
    },
  };
  reservation = {
    id: 55,
    code: "HO-ABC123",
    unitId: 101,
    status: "CONFIRMED",
    checkIn: "2026-08-10",
    checkOut: "2026-08-13",
    guests: 2,
    totalGr: 60000,
    email: "anna@example.com",
    phone: "+48600100200",
    locale: "pl",
    unit: { unitTypeId: 7, unitType: { propertyId: 3, name: "Dwuosobowy" } },
  };
  freeUnitList = [{ id: 101 }, { id: 102 }];
  unitFree = true;
  created.length = 0;
  updates.length = 0;
  freeUnitCalls.length = 0;
  syncCalls.length = 0;
  mails.length = 0;
  smses.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 30, 12, 0, 0));
});

describe("adminCreateReservation", () => {
  const VALID = {
    unitTypeId: "7",
    from: "2026-08-10",
    to: "2026-08-13",
    guests: "2",
    guestName: "Anna Kowalska",
    phone: "+48600100200",
    email: "anna@example.com",
    notes: "gość telefoniczny",
    totalZl: "",
  };

  it("zapisuje rezerwację od razu potwierdzoną, bez zaliczki", async () => {
    // recepcja rozlicza się z gościem na miejscu — nie ma po co blokować
    // terminu okienkiem na wpłatę
    expect(await target(adminCreateReservation(form(VALID)))).toBe("/admin/rezerwacje");

    expect(created[0]).toMatchObject({
      unitId: 101,
      status: "CONFIRMED",
      depositGr: 0,
      source: "MANUAL",
      totalGr: 60000,
    });
  });

  it("wybiera wolną jednostkę w transakcji", async () => {
    await target(adminCreateReservation(form(VALID)));

    expect(freeUnitCalls[0]).toMatchObject({ inTx: true, from: "2026-08-10", to: "2026-08-13" });
  });

  it("brak wolnej jednostki nie tworzy rezerwacji i mówi o tym recepcji", async () => {
    freeUnitList = [];

    const to = await target(adminCreateReservation(form(VALID)));

    expect(to).toContain("Brak wolnych jednostek");
    expect(created).toEqual([]);
  });

  it("recepcja może nadpisać cenę z cennika", async () => {
    // rabat udzielony przez telefon, cena z negocjacji — to jedyne miejsce,
    // gdzie kwota z formularza wygrywa
    await target(adminCreateReservation(form({ ...VALID, totalZl: "450,50" })));

    expect(created[0]).toMatchObject({ totalGr: 45050 });
  });

  it("nieczytelna cena jest odrzucana, zamiast zapisać NaN", async () => {
    const to = await target(adminCreateReservation(form({ ...VALID, totalZl: "pięćset" })));

    expect(to).toContain("Nieprawidłowa cena");
    expect(created).toEqual([]);
  });

  it("bez podanego e-maila wstawia adres zastępczy i nie wysyła maila", async () => {
    // rezerwacja z ulicy nie ma adresu; wysyłka pod atrapę to bounce
    await target(adminCreateReservation(form({ ...VALID, email: "" })));

    expect(created[0]).toMatchObject({ email: "brak@rezflow.local" });
    expect(mails).toEqual([]);
  });

  it("z prawdziwym e-mailem zaprasza gościa do meldunku online", async () => {
    await target(adminCreateReservation(form(VALID)));

    expect(mails.map((m) => m.to)).toEqual(["anna@example.com"]);
  });

  it("z numerem telefonu wysyła też SMS", async () => {
    await target(adminCreateReservation(form(VALID)));
    expect(smses.map((s) => s.to)).toEqual(["+48600100200"]);
  });

  it("brak liczby gości domyśla się jednego", async () => {
    await target(adminCreateReservation(form({ ...VALID, guests: "" })));
    expect(created[0]).toMatchObject({ guests: 1 });
  });

  it("odrzuca zły zakres dat i brak nazwiska", async () => {
    expect(
      await target(adminCreateReservation(form({ ...VALID, from: "2026-08-13", to: "2026-08-10" })))
    ).toContain("zakres dat");
    expect(
      await target(adminCreateReservation(form({ ...VALID, guestName: "Ab" })))
    ).toContain("imię i nazwisko");
    expect(created).toEqual([]);
  });

  it("typ pokoju z cudzego obiektu jest odrzucany", async () => {
    // identyfikator przychodzi z formularza — bez tej kontroli recepcja
    // jednego obiektu zapisałaby rezerwację w drugim
    unitType!.propertyId = 999;

    const to = await target(adminCreateReservation(form(VALID)));

    expect(to).toContain("Wybierz typ pokoju");
    expect(created).toEqual([]);
  });

  it("nieznany typ pokoju jest odrzucany", async () => {
    unitType = null;
    expect(await target(adminCreateReservation(form(VALID)))).toContain("Wybierz typ pokoju");
  });
});

describe("adminUpdateReservation", () => {
  const VALID = {
    id: "55",
    from: "2026-08-10",
    to: "2026-08-13",
    guests: "2",
    guestName: "Anna Kowalska",
    email: "anna@example.com",
    phone: "+48600100200",
    nip: "",
    notes: "",
    totalZl: "600,00",
  };

  it("zapisuje zmienione dane gościa i cenę", async () => {
    expect(await target(adminUpdateReservation(form(VALID)))).toBe(
      "/admin/rezerwacje/55?saved=1"
    );

    expect(updates[0].data).toMatchObject({
      guestName: "Anna Kowalska",
      totalGr: 60000,
      guests: 2,
    });
  });

  it("bez zmiany terminu nie szuka wolnych jednostek", async () => {
    // niepotrzebne zapytanie przy każdej zmianie notatki
    await target(adminUpdateReservation(form(VALID)));

    expect(freeUnitCalls).toEqual([]);
    expect(updates[0].data).toMatchObject({ unitId: 101 });
  });

  it("zmiana terminu sprawdza dostępność w transakcji, z pominięciem samej siebie", async () => {
    await target(
      adminUpdateReservation(form({ ...VALID, from: "2026-08-20", to: "2026-08-24" }))
    );

    expect(freeUnitCalls[0]).toMatchObject({ inTx: true, exclude: 55 });
  });

  it("zostawia gościa w tym samym pokoju, gdy jest wolny w nowym terminie", async () => {
    await target(
      adminUpdateReservation(form({ ...VALID, from: "2026-08-20", to: "2026-08-24" }))
    );

    expect(updates[0].data).toMatchObject({ unitId: 101 });
  });

  it("przenosi do innego pokoju, gdy dotychczasowy zajęty", async () => {
    freeUnitList = [{ id: 102 }];

    await target(
      adminUpdateReservation(form({ ...VALID, from: "2026-08-20", to: "2026-08-24" }))
    );

    expect(updates[0].data).toMatchObject({ unitId: 102 });
  });

  it("brak miejsc w nowym terminie zostawia rezerwację nietkniętą", async () => {
    freeUnitList = [];

    const to = await target(
      adminUpdateReservation(form({ ...VALID, from: "2026-08-20", to: "2026-08-24" }))
    );

    expect(to).toContain("Brak wolnych jednostek");
    expect(updates).toEqual([]);
  });

  it("anulowanej rezerwacji nie sprawdza pod kątem dostępności", async () => {
    // anulowana nie zajmuje terminu, więc jej daty można poprawić zawsze
    reservation!.status = "CANCELLED";

    await target(
      adminUpdateReservation(form({ ...VALID, from: "2026-08-20", to: "2026-08-24" }))
    );

    expect(freeUnitCalls).toEqual([]);
    expect(updates[0].data).toMatchObject({ checkIn: "2026-08-20" });
  });

  it("o zmianie terminu powiadamia gościa, o zmianie notatki nie", async () => {
    await target(
      adminUpdateReservation(form({ ...VALID, from: "2026-08-20", to: "2026-08-24" }))
    );
    expect(mails).toHaveLength(1);

    mails.length = 0;
    await target(adminUpdateReservation(form({ ...VALID, notes: "nowa notatka" })));
    expect(mails).toEqual([]);
  });

  it("gość z adresem zastępczym nie dostaje maila o zmianie terminu", async () => {
    await target(
      adminUpdateReservation(
        form({ ...VALID, email: "brak@rezflow.local", from: "2026-08-20", to: "2026-08-24" })
      )
    );

    expect(mails).toEqual([]);
  });

  it("rezerwacja z cudzego obiektu nie da się edytować", async () => {
    reservation!.unit.unitType.propertyId = 999;

    expect(await target(adminUpdateReservation(form(VALID)))).toBe("/admin/rezerwacje");
    expect(updates).toEqual([]);
  });

  it("odrzuca zły zakres dat, brak nazwiska i nieczytelną cenę", async () => {
    expect(
      await target(adminUpdateReservation(form({ ...VALID, to: "2026-08-10" })))
    ).toContain("zakres dat");
    expect(
      await target(adminUpdateReservation(form({ ...VALID, guestName: "" })))
    ).toContain("imię i nazwisko");
    expect(
      await target(adminUpdateReservation(form({ ...VALID, totalZl: "dużo" })))
    ).toContain("Nieprawidłowa cena");
    expect(updates).toEqual([]);
  });
});

describe("adminSetStatus", () => {
  it("potwierdzenie zdejmuje termin blokady i powiadamia gościa", async () => {
    reservation!.status = "PENDING";

    await maybeTarget(adminSetStatus(form({ id: "55", status: "CONFIRMED" })));

    expect(updates[0].data).toMatchObject({ status: "CONFIRMED", expiresAt: null });
    expect(mails.map((m) => m.to)).toEqual(["anna@example.com"]);
    expect(smses).toHaveLength(1);
  });

  it("powtórne potwierdzenie nie wysyła drugiego powiadomienia", async () => {
    // status już CONFIRMED — klik w panelu nie może zasypać gościa mailami
    await maybeTarget(adminSetStatus(form({ id: "55", status: "CONFIRMED" })));

    expect(updates).toHaveLength(1);
    expect(mails).toEqual([]);
    expect(smses).toEqual([]);
  });

  it("anulowanie zwalnia termin w kanałach", async () => {
    await maybeTarget(adminSetStatus(form({ id: "55", status: "CANCELLED" })));

    expect(updates[0].data).toMatchObject({ status: "CANCELLED" });
    expect(syncCalls).toEqual([{ unitId: 101, from: "2026-08-10", to: "2026-08-13" }]);
  });

  it("przywrócenie anulowanej sprawdza, czy termin jest jeszcze wolny", async () => {
    // w międzyczasie ktoś mógł zająć ten pokój — przywrócenie zrobiłoby
    // podwójną rezerwację
    reservation!.status = "CANCELLED";
    unitFree = false;

    const to = await maybeTarget(adminSetStatus(form({ id: "55", status: "CONFIRMED" })));

    expect(to).toContain("Termin jest już zajęty");
    expect(updates).toEqual([]);
  });

  it("przywrócenie przechodzi, gdy termin nadal wolny", async () => {
    reservation!.status = "CANCELLED";
    unitFree = true;

    await maybeTarget(adminSetStatus(form({ id: "55", status: "CONFIRMED" })));

    expect(updates[0].data).toMatchObject({ status: "CONFIRMED" });
  });

  it("nieznany status nie zmienia niczego", async () => {
    for (const status of ["ZROBIONE", "", "confirmed"]) {
      await maybeTarget(adminSetStatus(form({ id: "55", status })));
    }
    expect(updates).toEqual([]);
  });

  it("rezerwacja z cudzego obiektu nie da się przestawić", async () => {
    reservation!.unit.unitType.propertyId = 999;

    await maybeTarget(adminSetStatus(form({ id: "55", status: "CANCELLED" })));

    expect(updates).toEqual([]);
  });

  it("gość z adresem zastępczym nie dostaje maila o potwierdzeniu", async () => {
    reservation!.status = "PENDING";
    reservation!.email = "brak@rezflow.local";

    await maybeTarget(adminSetStatus(form({ id: "55", status: "CONFIRMED" })));

    expect(mails).toEqual([]);
    expect(smses).toHaveLength(1); // SMS nadal ma sens
  });
});
