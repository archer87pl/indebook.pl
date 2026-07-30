import { beforeEach, describe, expect, it, vi } from "vitest";

// Meldunek online i płatność zaliczki — dwie akcje z panelu gościa, obie
// dostępne po samym kodzie rezerwacji. Karta meldunkowa zbiera dane
// z dokumentu tożsamości, więc powstaje dokładnie raz i tylko dla rezerwacji,
// która faktycznie na to czeka. Zaliczka rozgałęzia się na bramkę P24 albo
// tryb symulacji — pomyłka oznacza rezerwację potwierdzoną bez pieniędzy.

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
  status: string;
  checkInStatus: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  depositGr: number;
  email: string;
  phone: string;
  guestName: string;
  locale: string;
  expiresAt: Date | null;
  checkInCard: { id: number } | null;
  unit: {
    unitType: {
      property: {
        id: number;
        name: string;
        arrivalInfo: string;
        owner: { email: string };
        p24MerchantId: string;
        p24PosId: string;
        p24ApiKey: string;
        p24Crc: string;
        p24Sandbox: boolean;
      };
    };
  };
};

let reservation: Reservation | null = null;
let gatewayResult: string | Error = "https://sandbox.przelewy24.pl/trnRequest/tok-123";

const cards: Record<string, unknown>[] = [];
const updates: Record<string, unknown>[] = [];
const mails: { to: string; subject: string; body: string }[] = [];
const smses: { to: string }[] = [];
const events: { kind: string; message: string }[] = [];

vi.mock("./db", () => ({
  prisma: {
    reservation: {
      findUnique: async () => reservation,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return data;
      },
    },
    checkInCard: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        cards.push(data);
        return data;
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

vi.mock("./payments", async (importOriginal) => {
  const original = await importOriginal<typeof import("./payments")>();
  return {
    ...original,
    createP24Payment: async () => {
      if (gatewayResult instanceof Error) throw gatewayResult;
      return gatewayResult;
    },
  };
});

vi.mock("./mailer", () => ({
  sendMail: async (m: { to: string; subject: string; body: string }) => void mails.push(m),
}));
vi.mock("./sms", () => ({ sendSms: async (s: { to: string }) => void smses.push(s) }));
vi.mock("./log", () => ({
  logEvent: async (e: { kind: string; message: string }) => void events.push(e),
}));
vi.mock("./rate-limit", () => ({ rateLimitOrRedirect: async () => {}, rateLimit: async () => true }));
vi.mock("./channex/enqueue-helpers", () => ({ afterAri: async () => {}, syncUnitRange: async () => {} }));
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

const { payDeposit, submitCheckIn } = await import("./actions");

const TODAY = new Date(2026, 6, 30, 12, 0, 0);

/** Podpis to PNG w data URL; walidator sprawdza nagłówek i rozmiar. */
const SIGNATURE = `data:image/png;base64,${Buffer.from(
  // minimalny poprawny PNG powielony, żeby przekroczyć próg długości
  "89504e470d0a1a0a0000000d49484452" + "00".repeat(200),
  "hex"
).toString("base64")}`;

const P24_OFF = {
  p24MerchantId: "",
  p24PosId: "",
  p24ApiKey: "",
  p24Crc: "",
  p24Sandbox: true,
};
const P24_ON = {
  p24MerchantId: "12345",
  p24PosId: "12345",
  p24ApiKey: "klucz",
  p24Crc: "crc",
  p24Sandbox: true,
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
  reservation = {
    id: 55,
    code: "HO-ABC123",
    status: "CONFIRMED",
    checkInStatus: "NONE",
    checkIn: "2026-08-10",
    checkOut: "2026-08-13",
    guests: 1,
    depositGr: 18000,
    email: "anna@example.com",
    phone: "+48600100200",
    guestName: "Anna Kowalska",
    locale: "pl",
    expiresAt: null,
    checkInCard: null,
    unit: {
      unitType: {
        property: {
          id: 3,
          name: "Willa Pod Dębem",
          arrivalInfo: "",
          owner: { email: "wlasciciel@example.com" },
          ...P24_OFF,
        },
      },
    },
  };
  gatewayResult = "https://sandbox.przelewy24.pl/trnRequest/tok-123";
  cards.length = 0;
  updates.length = 0;
  mails.length = 0;
  smses.length = 0;
  events.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});

const VALID_CHECKIN = {
  code: "HO-ABC123",
  fullName: "Anna Kowalska",
  address: "Warszawa, ul. Prosta 2",
  citizenship: "polskie",
  docType: "DOWOD",
  docNumber: "abc123456",
  carPlate: "wa 12345",
  arrivalTime: "16:30",
  signature: SIGNATURE,
  terms: "on",
  rodo: "on",
};

describe("submitCheckIn — poprawny meldunek", () => {
  it("zapisuje kartę i oznacza rezerwację jako zameldowaną", async () => {
    expect(await target(submitCheckIn(form(VALID_CHECKIN)))).toBe("/r/HO-ABC123?checkedin=1");

    expect(cards[0]).toMatchObject({
      reservationId: 55,
      fullName: "Anna Kowalska",
      citizenship: "polskie",
      termsAccepted: true,
      rodoAccepted: true,
    });
    expect(updates[0]).toMatchObject({ checkInStatus: "COMPLETED" });
  });

  it("numer dokumentu i tablice zapisuje wielkimi literami", async () => {
    // recepcja porównuje je z dokumentem — zapis ma być jednoznaczny
    await target(submitCheckIn(form(VALID_CHECKIN)));

    expect(cards[0]).toMatchObject({ docNumber: "ABC123456", carPlate: "WA 12345" });
  });

  it("karta i status rezerwacji powstają w jednej transakcji", async () => {
    // karta bez statusu pozwoliłaby wypełnić meldunek drugi raz
    await target(submitCheckIn(form(VALID_CHECKIN)));

    expect(cards).toHaveLength(1);
    expect(updates).toHaveLength(1);
  });

  it("wypełniony meldunek potwierdza adres e-mail rezerwacji", async () => {
    // link szedł na ten adres, więc jego użycie dowodzi, że jest prawdziwy
    await target(submitCheckIn(form(VALID_CHECKIN)));

    expect(updates[0]).toHaveProperty("emailVerifiedAt");
  });

  it("powiadamia gościa i właściciela", async () => {
    await target(submitCheckIn(form(VALID_CHECKIN)));

    expect(mails.map((m) => m.to)).toEqual(["anna@example.com", "wlasciciel@example.com"]);
  });

  it("informacje na przyjazd dołącza do wiadomości dla gościa", async () => {
    reservation!.unit.unitType.property.arrivalInfo = "Kod do bramy: 1234";

    await target(submitCheckIn(form(VALID_CHECKIN)));

    expect(mails[0].body).toContain("Kod do bramy: 1234");
  });

  it("właściciel z adresem zastępczym recepcji nie dostaje maila", async () => {
    // ręcznie założone konta mają adres @rezflow.local — wysyłka to bounce
    reservation!.unit.unitType.property.owner.email = "recepcja-3@rezflow.local";

    await target(submitCheckIn(form(VALID_CHECKIN)));

    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe("anna@example.com");
  });

  it("pola nieobowiązkowe mogą zostać puste", async () => {
    await target(
      submitCheckIn(form({ ...VALID_CHECKIN, docType: "", docNumber: "", carPlate: "", arrivalTime: "" }))
    );

    expect(cards[0]).toMatchObject({ docNumber: "", carPlate: "", arrivalTime: "" });
  });
});

describe("submitCheckIn — odmowy", () => {
  it("meldunek wypełniony wcześniej nie da się powtórzyć", async () => {
    // druga karta nadpisałaby dane pierwszej albo zdublowała je w bazie
    reservation!.checkInCard = { id: 9 };

    const to = await target(submitCheckIn(form(VALID_CHECKIN)));

    expect(to).toContain("checkInDone");
    expect(cards).toEqual([]);
  });

  it("rezerwacja nieopłacona nie pozwala się zameldować", async () => {
    reservation!.status = "PENDING";

    expect(await target(submitCheckIn(form(VALID_CHECKIN)))).toContain("checkInUnavailable");
    expect(cards).toEqual([]);
  });

  it("pobyt zakończony nie pozwala się zameldować", async () => {
    reservation!.checkOut = "2026-07-29";

    expect(await target(submitCheckIn(form(VALID_CHECKIN)))).toContain("checkInUnavailable");
  });

  it("brak wymaganych danych osobowych jest odrzucany", async () => {
    const cases: [Partial<typeof VALID_CHECKIN>, string][] = [
      [{ fullName: "Ab" }, "nameRequired"],
      [{ address: "ul." }, "addressRequired"],
      [{ citizenship: "pl" }, "citizenshipRequired"],
    ];

    for (const [override, code] of cases) {
      expect(
        await target(submitCheckIn(form({ ...VALID_CHECKIN, ...override }))),
        JSON.stringify(override)
      ).toContain(code);
    }
    expect(cards).toEqual([]);
  });

  it("numer dokumentu bez wskazania jego rodzaju jest odrzucany", async () => {
    const to = await target(submitCheckIn(form({ ...VALID_CHECKIN, docType: "" })));

    expect(to).toContain("docTypeRequired");
  });

  it("nieznany rodzaj dokumentu jest odrzucany", async () => {
    expect(
      await target(submitCheckIn(form({ ...VALID_CHECKIN, docType: "LEGITYMACJA" })))
    ).toContain("docTypeInvalid");
  });

  it("numer dokumentu i tablice muszą mieć sensowny format", async () => {
    expect(
      await target(submitCheckIn(form({ ...VALID_CHECKIN, docNumber: "ab" })))
    ).toContain("docNumberInvalid");
    expect(
      await target(submitCheckIn(form({ ...VALID_CHECKIN, docNumber: "a".repeat(25) })))
    ).toContain("docNumberInvalid");
    expect(
      await target(submitCheckIn(form({ ...VALID_CHECKIN, carPlate: "w" })))
    ).toContain("plateInvalid");
  });

  it("godzina przyjazdu w innym formacie jest odrzucana", async () => {
    for (const arrivalTime of ["16.30", "4pm", "1630"]) {
      expect(
        await target(submitCheckIn(form({ ...VALID_CHECKIN, arrivalTime }))),
        arrivalTime
      ).toContain("arrivalTimeInvalid");
    }
  });

  it("bez akceptacji regulaminu i zgody RODO karta nie powstaje", async () => {
    expect(await target(submitCheckIn(form({ ...VALID_CHECKIN, terms: "" })))).toContain(
      "termsRequired"
    );
    expect(await target(submitCheckIn(form({ ...VALID_CHECKIN, rodo: "" })))).toContain(
      "rodoRequired"
    );
    expect(cards).toEqual([]);
  });

  it("bez podpisu karta nie powstaje", async () => {
    // podpis jest tym, co czyni kartę dokumentem — pusty płótno nie wystarcza
    for (const signature of ["", "data:image/png;base64,krotkie", "nie-jest-obrazem"]) {
      expect(
        await target(submitCheckIn(form({ ...VALID_CHECKIN, signature }))),
        signature.slice(0, 20)
      ).toContain("signatureRequired");
    }
    expect(cards).toEqual([]);
  });

  it("nieznany kod rezerwacji odsyła na stronę główną", async () => {
    reservation = null;
    expect(await target(submitCheckIn(form(VALID_CHECKIN)))).toBe("/");
  });
});

describe("payDeposit", () => {
  beforeEach(() => {
    reservation!.status = "PENDING";
    reservation!.expiresAt = new Date(TODAY.getTime() + 600_000);
  });

  it("z bramką P24 przekierowuje gościa na płatność, bez potwierdzania rezerwacji", async () => {
    // rezerwację potwierdza dopiero powiadomienie od operatora
    Object.assign(reservation!.unit.unitType.property, P24_ON);

    const to = await target(payDeposit(form({ code: "HO-ABC123" })));

    expect(to).toBe("https://sandbox.przelewy24.pl/trnRequest/tok-123");
    expect(updates).toEqual([]);
    expect(mails).toEqual([]);
  });

  it("błąd bramki wraca komunikatem, a rezerwacja zostaje nieopłacona", async () => {
    Object.assign(reservation!.unit.unitType.property, P24_ON);
    gatewayResult = new Error("P24 register: HTTP 401");

    const to = await target(payDeposit(form({ code: "HO-ABC123" })));

    expect(to).toContain("Nie udało się rozpocząć płatności");
    expect(to).toContain("HTTP 401");
    expect(updates).toEqual([]);
  });

  it("bez skonfigurowanej bramki potwierdza rezerwację w trybie symulacji", async () => {
    const to = await target(payDeposit(form({ code: "HO-ABC123" })));

    expect(to).toBe("/r/HO-ABC123");
    expect(updates[0]).toMatchObject({ status: "CONFIRMED", expiresAt: null });
    expect(events[0]).toMatchObject({ kind: "PAYMENT" });
    expect(events[0].message).toContain("symulacja");
  });

  it("symulacja wysyła gościowi potwierdzenie i SMS z linkiem do meldunku", async () => {
    await target(payDeposit(form({ code: "HO-ABC123" })));

    expect(mails[0].to).toBe("anna@example.com");
    expect(smses[0].to).toBe("+48600100200");
  });

  it("gość bez telefonu dostaje sam e-mail", async () => {
    reservation!.phone = "";

    await target(payDeposit(form({ code: "HO-ABC123" })));

    expect(mails).toHaveLength(1);
    expect(smses).toEqual([]);
  });

  it("rezerwacja już potwierdzona nie da się opłacić drugi raz", async () => {
    reservation!.status = "CONFIRMED";
    reservation!.expiresAt = null;

    expect(await target(payDeposit(form({ code: "HO-ABC123" })))).toBe("/r/HO-ABC123");
    expect(updates).toEqual([]);
  });

  it("rezerwacja po terminie na zaliczkę nie da się opłacić", async () => {
    // termin wrócił już do sprzedaży — płatność stworzyłaby konflikt
    reservation!.expiresAt = new Date(TODAY.getTime() - 1000);

    expect(await target(payDeposit(form({ code: "HO-ABC123" })))).toBe("/r/HO-ABC123");
    expect(updates).toEqual([]);
  });

  it("nieznany kod odsyła na stronę główną", async () => {
    reservation = null;
    expect(await target(payDeposit(form({ code: "HO-NIE-MA" })))).toBe("/");
  });
});
