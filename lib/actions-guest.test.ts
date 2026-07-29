import { beforeEach, describe, expect, it, vi } from "vitest";

// Samoobsługa gościa: zmiana terminu, anulowanie i wyszukanie rezerwacji.
// Te akcje nie mają za sobą logowania — jedynym „hasłem" jest kod rezerwacji
// (przy wyszukiwaniu dodatkowo e-mail), więc próby zgadywania kodu są
// limitowane. Zmiana terminu przelicza cenę i pilnuje, żeby rezerwacja nie
// kolidowała sama ze sobą.

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

type Reservation = {
  id: number;
  code: string;
  unitId: number;
  status: string;
  expiresAt: Date | null;
  checkIn: string;
  checkOut: string;
  guests: number;
  totalGr: number;
  discountGr: number;
  depositGr: number;
  email: string;
  guestName: string;
  locale: string;
  unit: {
    unitType: {
      id: number;
      propertyId: number;
      maxGuests: number;
      minStay: number;
      basePriceGr: number;
      seasons: unknown[];
      property: { id: number; depositPercent: number; plan: string; pricingMode: string; smartRateMarketId: string | null };
    };
  };
};

let reservation: Reservation | null = null;
let freeUnitList: { id: number }[] = [];
let rateLimited = false;

const updates: { id: number; data: Record<string, unknown> }[] = [];
const freeUnitCalls: { from: string; to: string; inTx: boolean; exclude?: number }[] = [];
const syncCalls: { unitId: number; from: string; to: string }[] = [];
const mails: { to: string; subject: string }[] = [];
const events: { level?: string; message: string }[] = [];

vi.mock("./db", () => ({
  prisma: {
    reservation: {
      findUnique: async () => reservation,
      update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
        updates.push({ id: where.id, data });
        return data;
      },
    },
    property: { findUnique: async () => reservation?.unit.unitType.property ?? null },
    pricingRule: { findMany: async () => [] },
    unit: { findMany: async () => freeUnitList },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        reservation: {
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
    isUnitFree: async () => true,
  };
});

vi.mock("./mailer", () => ({
  sendMail: async (m: { to: string; subject: string }) => void mails.push(m),
}));
vi.mock("./sms", () => ({ sendSms: async () => {} }));
vi.mock("./log", () => ({
  logEvent: async (e: { level?: string; message: string }) => void events.push(e),
}));
vi.mock("./rate-limit", () => ({
  rateLimitOrRedirect: async (_a: string, _l: number, _w: number, redirectTo: string) => {
    if (rateLimited) throw new RedirectError(redirectTo);
  },
  rateLimit: async () => !rateLimited,
}));
vi.mock("./channex/enqueue-helpers", () => ({
  afterAri: async () => {},
  syncUnitRange: async (unitId: number, from: string, to: string) => {
    syncCalls.push({ unitId, from, to });
  },
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

const { cancelByGuest, changeReservationDates, findReservation } = await import("./actions");

const TODAY = new Date(2026, 6, 30, 12, 0, 0);

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
  reservation = {
    id: 55,
    code: "HO-ABC123",
    unitId: 101,
    status: "CONFIRMED",
    expiresAt: null,
    checkIn: "2026-08-10",
    checkOut: "2026-08-13",
    guests: 2,
    totalGr: 60000,
    discountGr: 0,
    depositGr: 18000,
    email: "anna@example.com",
    guestName: "Anna Kowalska",
    locale: "pl",
    unit: {
      unitType: {
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
      },
    },
  };
  freeUnitList = [{ id: 101 }, { id: 102 }];
  rateLimited = false;
  updates.length = 0;
  freeUnitCalls.length = 0;
  syncCalls.length = 0;
  mails.length = 0;
  events.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});

describe("changeReservationDates — udana zmiana", () => {
  const NEW = { code: "HO-ABC123", from: "2026-08-20", to: "2026-08-24", guests: "2" };

  it("zapisuje nowy termin i przelicza kwotę", async () => {
    expect(await target(changeReservationDates(form(NEW)))).toBe("/r/HO-ABC123?changed=1");

    expect(updates[0].data).toMatchObject({
      checkIn: "2026-08-20",
      checkOut: "2026-08-24",
      totalGr: 80000, // 4 noce × 200 zł
    });
  });

  it("zostawia gościa w tym samym pokoju, jeśli jest wolny", async () => {
    // zmiana pokoju bez potrzeby to zamieszanie na recepcji i w kanałach
    await target(changeReservationDates(form(NEW)));

    expect(updates[0].data).toMatchObject({ unitId: 101 });
  });

  it("przenosi do innego pokoju, gdy dotychczasowy jest zajęty w nowym terminie", async () => {
    freeUnitList = [{ id: 102 }];

    await target(changeReservationDates(form(NEW)));

    expect(updates[0].data).toMatchObject({ unitId: 102 });
  });

  it("własna rezerwacja nie liczy się jako kolizja", async () => {
    // bez wykluczenia gość przesuwający termin o jeden dzień kolidowałby
    // sam ze sobą i dostawał „brak miejsc"
    await target(changeReservationDates(form(NEW)));

    expect(freeUnitCalls[0]).toMatchObject({ inTx: true, exclude: 55 });
  });

  it("zaliczka przelicza się tylko dopóki nie została opłacona", async () => {
    // rezerwacja CONFIRMED ma zaliczkę wpłaconą — nadpisanie kwoty
    // rozjechałoby ją z tym, co gość faktycznie zapłacił
    await target(changeReservationDates(form(NEW)));
    expect(updates[0].data).not.toHaveProperty("depositGr");

    updates.length = 0;
    reservation!.status = "PENDING";
    reservation!.expiresAt = new Date(TODAY.getTime() + 600_000);

    await target(changeReservationDates(form(NEW)));
    expect(updates[0].data).toMatchObject({ depositGr: 24000 });
  });

  it("rabat zostaje zachowany proporcjonalnie", async () => {
    // gość, który rezerwował z kodem −10%, nie może go stracić przy zmianie
    reservation!.totalGr = 54000;
    reservation!.discountGr = 6000;

    await target(changeReservationDates(form(NEW)));

    expect(updates[0].data).toMatchObject({ discountGr: 8000, totalGr: 72000 });
  });

  it("synchronizacja kanałów pokrywa okno stare i nowe razem", async () => {
    // zwolniony stary termin musi wrócić do sprzedaży, a nowy zniknąć —
    // jeden push na sumę obu okien załatwia oba
    await target(changeReservationDates(form({ ...NEW, from: "2026-08-05", to: "2026-08-24" })));

    expect(syncCalls).toEqual([{ unitId: 101, from: "2026-08-05", to: "2026-08-24" }]);
  });

  it("powiadamia gościa o zmianie", async () => {
    await target(changeReservationDates(form(NEW)));
    expect(mails[0].to).toBe("anna@example.com");
  });

  it("zmiana samej liczby gości też jest zmianą", async () => {
    await target(
      changeReservationDates(
        form({ code: "HO-ABC123", from: "2026-08-10", to: "2026-08-13", guests: "3" })
      )
    );

    expect(updates[0].data).toMatchObject({ guests: 3 });
  });

  it("pusta liczba gości zachowuje dotychczasową", async () => {
    await target(changeReservationDates(form({ ...NEW, guests: "" })));

    expect(updates[0].data).toMatchObject({ guests: 2 });
  });
});

describe("changeReservationDates — odmowy", () => {
  const NEW = { code: "HO-ABC123", from: "2026-08-20", to: "2026-08-24", guests: "2" };

  it("anulowana rezerwacja nie da się zmienić", async () => {
    reservation!.status = "CANCELLED";

    const to = await target(changeReservationDates(form(NEW)));

    expect(to).toContain("notChangeable");
    expect(updates).toEqual([]);
  });

  it("wstępna rezerwacja po wygaśnięciu nie da się zmienić", async () => {
    // termin już wrócił do sprzedaży — zmiana odtworzyłaby blokadę
    reservation!.status = "PENDING";
    reservation!.expiresAt = new Date(TODAY.getTime() - 1000);

    expect(await target(changeReservationDates(form(NEW)))).toContain("notChangeable");
  });

  it("rozpoczęty pobyt nie da się przesunąć", async () => {
    reservation!.checkIn = "2026-07-30"; // dziś

    const to = await target(changeReservationDates(form(NEW)));

    expect(to).toContain("stayStarted");
    expect(updates).toEqual([]);
  });

  it("odwrócony zakres i data w przeszłości są odrzucane", async () => {
    expect(
      await target(changeReservationDates(form({ ...NEW, from: "2026-08-24", to: "2026-08-20" })))
    ).toContain("invalidRange");

    expect(
      await target(changeReservationDates(form({ ...NEW, from: "2026-07-01", to: "2026-07-05" })))
    ).toContain("pastArrival");
  });

  it("liczba gości poza pojemnością pokoju jest odrzucana, z podaniem limitu", async () => {
    const to = await target(changeReservationDates(form({ ...NEW, guests: "9" })));

    expect(to).toContain("guestsRange");
    expect(to).toContain("4");
  });

  it("zapis bez żadnej zmiany jest odrzucany", async () => {
    // inaczej każde kliknięcie „Zapisz" wysyłałoby gościowi maila o zmianie
    const to = await target(
      changeReservationDates(
        form({ code: "HO-ABC123", from: "2026-08-10", to: "2026-08-13", guests: "2" })
      )
    );

    expect(to).toContain("nothingChanged");
    expect(updates).toEqual([]);
  });

  it("nowy termin krótszy niż minimum jest odrzucany", async () => {
    reservation!.unit.unitType.minStay = 7;

    const to = await target(changeReservationDates(form(NEW)));

    expect(to).toContain("minStay");
  });

  it("brak wolnego pokoju w nowym terminie zostawia rezerwację nietkniętą", async () => {
    freeUnitList = [];

    const to = await target(changeReservationDates(form(NEW)));

    expect(to).toContain("noRoomsForNewDates");
    expect(updates).toEqual([]);
    expect(syncCalls).toEqual([]);
  });

  it("nieznany kod rezerwacji odsyła na stronę główną", async () => {
    reservation = null;
    expect(await target(changeReservationDates(form(NEW)))).toBe("/");
  });
});

describe("cancelByGuest", () => {
  it("anuluje rezerwację, oddaje termin i powiadamia gościa", async () => {
    expect(await target(cancelByGuest(form({ code: "HO-ABC123" })))).toBe("/r/HO-ABC123");

    expect(updates[0]).toMatchObject({ id: 55, data: { status: "CANCELLED" } });
    expect(syncCalls).toEqual([{ unitId: 101, from: "2026-08-10", to: "2026-08-13" }]);
    expect(mails[0].to).toBe("anna@example.com");
    expect(events[0]).toMatchObject({ level: "WARN" });
  });

  it("powtórne anulowanie nie robi nic drugi raz", async () => {
    // odświeżenie strony po anulowaniu nie może wysłać drugiego maila
    reservation!.status = "CANCELLED";

    expect(await target(cancelByGuest(form({ code: "HO-ABC123" })))).toBe("/r/HO-ABC123");

    expect(updates).toEqual([]);
    expect(mails).toEqual([]);
    expect(syncCalls).toEqual([]);
  });

  it("nieznany kod odsyła na stronę główną, bez ujawniania czegokolwiek", async () => {
    reservation = null;
    expect(await target(cancelByGuest(form({ code: "HO-NIE-MA" })))).toBe("/");
  });
});

describe("findReservation", () => {
  it("kod i zgodny e-mail wpuszczają do panelu gościa", async () => {
    const to = await target(
      findReservation(form({ code: "ho-abc123", email: "ANNA@example.com" }))
    );

    expect(to).toBe("/r/HO-ABC123");
  });

  it("niezgodny e-mail nie wpuszcza, choć kod jest poprawny", async () => {
    // sam kod nie wystarcza: e-mail jest drugim składnikiem
    const to = await target(
      findReservation(form({ code: "HO-ABC123", email: "ktos.inny@example.com" }))
    );

    expect(to).toContain("/moja-rezerwacja?error=1");
  });

  it("nieznany kod i zły e-mail dają tę samą odpowiedź", async () => {
    // różne komunikaty pozwalałyby ustalić, które kody istnieją
    const wrongEmail = await target(
      findReservation(form({ code: "HO-ABC123", email: "zly@example.com" }))
    );
    reservation = null;
    const wrongCode = await target(
      findReservation(form({ code: "HO-NIE-MA", email: "anna@example.com" }))
    );

    expect(wrongEmail.split("&code=")[0]).toBe(wrongCode.split("&code=")[0]);
  });

  it("zgadywanie kodów jest limitowane", async () => {
    // 15 prób na 10 minut — bez tego kody dałoby się przeszukać
    rateLimited = true;

    expect(await target(findReservation(form({ code: "HO-X", email: "a@example.com" })))).toBe(
      "/moja-rezerwacja?error=rate"
    );
  });
});
