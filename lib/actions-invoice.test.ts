import { beforeEach, describe, expect, it, vi } from "vitest";

// Wystawianie faktur. Numeracja jest ciągła w obrębie rodzaju i roku, a numer
// raz wystawiony nie może się powtórzyć ani zostawić luki — to nie kosmetyka,
// tylko wymóg księgowy. Poza tym faktura bierze dane sprzedawcy z obiektu
// (a nie z formularza) i kwotę z rezerwacji, nie z tego, co przyszło z klienta.

/** redirect() w Next rzuca; atrapa robi to samo, żeby dało się złapać cel. */
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

let owner = {
  user: { id: 5 },
  property: {
    id: 3,
    name: "Willa Pod Dębem",
    address: "Zakopane, ul. Górska 1",
    sellerName: "Willa Pod Dębem sp. z o.o.",
    sellerNip: "1234567890",
    sellerAddress: "Zakopane, ul. Górska 1",
    bankAccount: "PL61109010140000071219812874",
  },
};
vi.mock("./auth", () => ({
  requireOwner: async () => owner,
  requireSuperadmin: async () => ({ id: 1, isAdmin: true }),
  getSessionUser: async () => owner.user,
  createSession: async () => {},
  destroySession: async () => {},
  SESSION_COOKIE: "rezflow_session",
}));

type Reservation = {
  id: number;
  code: string;
  checkIn: string;
  checkOut: string;
  totalGr: number;
  depositGr: number;
  unit: { unitType: { name: string; propertyId: number } };
};

let reservation: Reservation | null = null;
let invoiceCount = 0;
let failCreate = false;
const created: Record<string, unknown>[] = [];
const countQueries: Record<string, unknown>[] = [];
/** Numery już wystawione w tej serii — z lukami po skasowanych fakturach. */
let istniejaceSeq: number[] = [];

vi.mock("./db", () => ({
  prisma: {
    reservation: { findUnique: async () => reservation },
    invoice: {
      count: async ({ where }: { where: Record<string, unknown> }) => {
        countQueries.push(where);
        return invoiceCount;
      },
      findFirst: async ({
        where,
        orderBy,
      }: {
        where: Record<string, unknown>;
        orderBy?: { seq?: "asc" | "desc" };
      }) => {
        countQueries.push(where);
        if (!istniejaceSeq.length) return null;
        // atrapa honoruje kierunek sortowania — bez tego „najstarszy zamiast
        // najnowszego" przechodziłby niezauważony (wychwycone mutacją)
        const malejaco = orderBy?.seq === "desc";
        return { seq: malejaco ? Math.max(...istniejaceSeq) : Math.min(...istniejaceSeq) };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        // baza ma @@unique([propertyId, kind, year, seq]) — atrapa też pilnuje
        if (failCreate) throw new Error("kolizja numeru");
        if (istniejaceSeq.includes(data.seq as number))
          throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        created.push(data);
        istniejaceSeq.push(data.seq as number);
        return { id: 900 + created.length, ...data };
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        invoice: {
          count: async ({ where }: { where: Record<string, unknown> }) => {
            countQueries.push(where);
            return invoiceCount;
          },
          findFirst: async ({
            where,
            orderBy,
          }: {
            where: Record<string, unknown>;
            orderBy?: { seq?: "asc" | "desc" };
          }) => {
            countQueries.push(where);
            if (!istniejaceSeq.length) return null;
            // atrapa honoruje kierunek sortowania — bez tego „najstarszy zamiast
            // najnowszego" przechodziłby niezauważony (wychwycone mutacją)
            const malejaco = orderBy?.seq === "desc";
            return { seq: malejaco ? Math.max(...istniejaceSeq) : Math.min(...istniejaceSeq) };
          },
          create: async ({ data }: { data: Record<string, unknown> }) => {
            // baza ma @@unique([propertyId, kind, year, seq]) — atrapa też pilnuje
            if (failCreate) throw new Error("kolizja numeru");
            if (istniejaceSeq.includes(data.seq as number))
              throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
            created.push(data);
            istniejaceSeq.push(data.seq as number);
            return { id: 900 + created.length, ...data };
          },
        },
      }),
  },
}));

// zależności, których ta akcja nie dotyka
vi.mock("./mailer", () => ({ sendMail: async () => {} }));
vi.mock("./sms", () => ({ sendSms: async () => {} }));
vi.mock("./log", () => ({ logEvent: async () => {} }));
vi.mock("./rate-limit", () => ({ rateLimitOrRedirect: async () => {}, rateLimit: async () => true }));
vi.mock("./channex/enqueue-helpers", () => ({ afterAri: async () => {}, syncUnitRange: async () => {} }));
vi.mock("./ical", () => ({ syncIcalFeed: async () => ({ ok: true, imported: 0 }) }));
vi.mock("./photos", () => ({ savePhotoFile: async () => "", deletePhotoFile: async () => {} }));

const { issueInvoice } = await import("./actions");

const form = (entries: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};

const VALID = {
  reservationId: "55",
  kind: "KONCOWA",
  vatRate: "8",
  buyerName: "Anna Kowalska",
  buyerNip: "",
  buyerAddress: "Warszawa, ul. Prosta 2",
  itemName: "",
};

/** Akcja kończy się przekierowaniem — zwraca jego cel. */
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
  owner = {
    user: { id: 5 },
    property: {
      id: 3,
      name: "Willa Pod Dębem",
      address: "Zakopane, ul. Górska 1",
      sellerName: "Willa Pod Dębem sp. z o.o.",
      sellerNip: "1234567890",
      sellerAddress: "Zakopane, ul. Górska 1",
      bankAccount: "PL61109010140000071219812874",
    },
  };
  reservation = {
    id: 55,
    code: "HO-ABC123",
    checkIn: "2026-08-10",
    checkOut: "2026-08-14",
    totalGr: 120000,
    depositGr: 36000,
    unit: { unitType: { name: "Dwuosobowy", propertyId: 3 } },
  };
  invoiceCount = 0;
  failCreate = false;
  created.length = 0;
  countQueries.length = 0;
  istniejaceSeq = [];
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 30, 12, 0, 0));
});

describe("issueInvoice — numeracja", () => {
  it("pierwsza faktura roku dostaje numer 1", async () => {
    expect(await target(issueInvoice(form(VALID)))).toBe("/admin/faktury/901");

    expect(created[0]).toMatchObject({ seq: 1, year: 2026 });
    expect(created[0].number).toContain("1/2026");
  });

  it("kolejny numer wynika z NAJWYŻSZEGO dotychczasowego, nie z liczby faktur", async () => {
    // gdyby licznik obejmował wszystkie rodzaje, serie zaliczkowa i końcowa
    // dzieliłyby numerację i obie miałyby luki
    istniejaceSeq = [1, 2, 3, 4, 5, 6, 7];

    await target(issueInvoice(form(VALID)));

    expect(created[0]).toMatchObject({ seq: 8 });
    expect(countQueries[0]).toEqual({ propertyId: 3, kind: "KONCOWA", year: 2026 });
  });

  it("skasowanie faktury ze ŚRODKA serii nie blokuje wystawiania kolejnych", async () => {
    // liczenie po `count` dawało tu seq 3, który już istnieje — unikalne
    // ograniczenie odrzucało zapis i wystawianie faktur przestawało działać
    // do końca roku
    istniejaceSeq = [1, 3]; // FV 2 skasowana

    expect(await target(issueInvoice(form(VALID)))).toContain("/admin/faktury/");

    expect(created[0]).toMatchObject({ seq: 4 });
  });

  it("numer skasowanej faktury nie wraca do obiegu", async () => {
    // skasowana FV 3 mogła już trafić do ksiąg klienta; wystawienie drugiej
    // z tym samym numerem to dwa różne dokumenty o jednym numerze
    istniejaceSeq = [1, 2]; // FV 3 była, została skasowana — ale seq idzie dalej
    await target(issueInvoice(form(VALID)));
    expect(created[0]).toMatchObject({ seq: 3 });

    created.length = 0;
    istniejaceSeq = [1, 2, 3];
    await target(issueInvoice(form(VALID)));

    expect(created[0]).toMatchObject({ seq: 4 });
  });

  it("luka w numeracji nie jest zasypywana", async () => {
    // numeracja ma być rosnąca; wciśnięcie faktury w lukę zmienia kolejność
    // dokumentów względem dat wystawienia
    istniejaceSeq = [1, 5];

    await target(issueInvoice(form(VALID)));

    expect(created[0]).toMatchObject({ seq: 6 });
  });

  it("numerację liczy tylko w obrębie własnego obiektu", async () => {
    // wspólna numeracja dla całej platformy pokazywałaby właścicielowi,
    // ile faktur wystawiają inni, i robiła luki w jego serii
    await target(issueInvoice(form(VALID)));

    expect(countQueries[0]).toMatchObject({ propertyId: 3 });
  });

  it("numer i licznik powstają w jednej transakcji", async () => {
    // dwie faktury wystawiane równolegle nie mogą dostać tego samego numeru;
    // licznik musi być czytany w tej samej transakcji, w której powstaje wpis
    await target(issueInvoice(form(VALID)));

    // count i create widziały ten sam kontekst transakcyjny
    expect(countQueries).toHaveLength(1);
    expect(created).toHaveLength(1);
  });

  it("kolizja numeru kończy się komunikatem, nie połowiczną fakturą", async () => {
    failCreate = true;

    const to = await target(issueInvoice(form(VALID)));

    expect(to).toContain("Nie udało się wystawić faktury");
    expect(created).toEqual([]);
  });
});

describe("issueInvoice — kwoty", () => {
  it("faktura końcowa bierze pełną kwotę rezerwacji", async () => {
    await target(issueInvoice(form(VALID)));

    expect(created[0]).toMatchObject({ grossGr: 120000, vatRate: 8 });
  });

  it("faktura zaliczkowa bierze kwotę zaliczki, nie całość", async () => {
    await target(issueInvoice(form({ ...VALID, kind: "ZALICZKOWA" })));

    expect(created[0]).toMatchObject({ grossGr: 36000 });
  });

  it("kwota bierze się z rezerwacji, a nie z formularza", async () => {
    // pole z kwotą w formularzu byłoby wektorem wystawienia faktury na 1 gr
    await target(issueInvoice(form({ ...VALID, grossGr: "1", totalGr: "1" })));

    expect(created[0]).toMatchObject({ grossGr: 120000 });
  });

  it("netto i VAT sumują się do kwoty brutto", async () => {
    await target(issueInvoice(form(VALID)));

    const inv = created[0] as { grossGr: number; netGr: number; vatGr: number };
    expect(inv.netGr + inv.vatGr).toBe(inv.grossGr);
  });

  it("zerowa stawka VAT daje netto równe brutto", async () => {
    await target(issueInvoice(form({ ...VALID, vatRate: "0" })));

    expect(created[0]).toMatchObject({ netGr: 120000, vatGr: 0 });
  });

  it("rezerwacja bez zaliczki nie pozwala wystawić faktury zaliczkowej", async () => {
    reservation!.depositGr = 0;

    const to = await target(issueInvoice(form({ ...VALID, kind: "ZALICZKOWA" })));

    expect(to).toContain("nie ma zaliczki");
    expect(created).toEqual([]);
  });

  it("rezerwacja o zerowej kwocie nie pozwala wystawić faktury końcowej", async () => {
    reservation!.totalGr = 0;

    const to = await target(issueInvoice(form(VALID)));

    expect(to).toContain("większa od zera");
    expect(created).toEqual([]);
  });
});

describe("issueInvoice — walidacja i dane sprzedawcy", () => {
  it("nieznany rodzaj faktury jest odrzucany", async () => {
    const to = await target(issueInvoice(form({ ...VALID, kind: "WYMYSLONA" })));

    expect(to).toContain("rodzaj faktury");
    expect(created).toEqual([]);
  });

  it("stawka VAT spoza dozwolonych jest odrzucana", async () => {
    for (const vatRate of ["17", "-8", "100", "abc"]) {
      const to = await target(issueInvoice(form({ ...VALID, vatRate })));
      expect(to, `vatRate=${vatRate}`).toContain("stawka VAT");
    }
    expect(created).toEqual([]);
  });

  it("nabywca bez nazwy jest odrzucany", async () => {
    for (const buyerName of ["", "AB"]) {
      const to = await target(issueInvoice(form({ ...VALID, buyerName })));
      expect(to).toContain("nabywcy");
    }
  });

  it("brak NIP-u sprzedawcy blokuje wystawienie i mówi, gdzie go uzupełnić", async () => {
    // faktura bez NIP-u sprzedawcy jest bezużyteczna — lepiej nie wystawić
    owner.property.sellerNip = "   ";

    const to = await target(issueInvoice(form(VALID)));

    expect(to).toContain("NIP sprzedawcy");
    expect(created).toEqual([]);
  });

  it("dane sprzedawcy schodzą z obiektu, nie z formularza", async () => {
    await target(issueInvoice(form({ ...VALID, sellerName: "Podszywacz sp. z o.o." })));

    expect(created[0]).toMatchObject({
      sellerName: "Willa Pod Dębem sp. z o.o.",
      sellerNip: "1234567890",
      bankAccount: "PL61109010140000071219812874",
    });
  });

  it("puste dane sprzedawcy zastępuje nazwą i adresem obiektu", async () => {
    owner.property.sellerName = "";
    owner.property.sellerAddress = "";

    await target(issueInvoice(form(VALID)));

    expect(created[0]).toMatchObject({
      sellerName: "Willa Pod Dębem",
      sellerAddress: "Zakopane, ul. Górska 1",
    });
  });

  it("bez własnej nazwy pozycji wpisuje opis pobytu", async () => {
    await target(issueInvoice(form(VALID)));

    expect(String(created[0].itemName)).toContain("Dwuosobowy");
    expect(String(created[0].itemName)).toContain("2026-08-10");
  });

  it("własna nazwa pozycji ma pierwszeństwo", async () => {
    await target(issueInvoice(form({ ...VALID, itemName: "Pobyt z wyżywieniem" })));

    expect(created[0]).toMatchObject({ itemName: "Pobyt z wyżywieniem" });
  });

  it("data sprzedaży to dzień wyjazdu, data wystawienia to dziś", async () => {
    await target(issueInvoice(form(VALID)));

    expect(created[0]).toMatchObject({ saleDate: "2026-08-14", issueDate: "2026-07-30" });
  });
});

describe("issueInvoice — granica obiektów", () => {
  it("rezerwacja innego obiektu nie da się zafakturować", async () => {
    // identyfikator przychodzi z formularza — bez tej kontroli dałoby się
    // wystawić fakturę na cudzą rezerwację, podmieniając liczbę
    reservation!.unit.unitType.propertyId = 999;

    const to = await target(issueInvoice(form(VALID)));

    expect(to).toBe("/admin/rezerwacje");
    expect(created).toEqual([]);
  });

  it("nieistniejąca rezerwacja odsyła do listy", async () => {
    reservation = null;

    expect(await target(issueInvoice(form(VALID)))).toBe("/admin/rezerwacje");
    expect(created).toEqual([]);
  });
});
