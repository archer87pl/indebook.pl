import { beforeEach, describe, expect, it, vi } from "vitest";

// Ustawienia obiektu, konfiguracja płatności, plan, FAQ i kody promocyjne.
// Wspólny motyw: dane P24 to sekrety, które formularz celowo pokazuje pusto —
// puste pole musi znaczyć „bez zmian", nigdy „wyczyść". Obniżenie planu jest
// blokowane, gdy obiekt ma więcej jednostek, niż nowy plan pozwala.

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

type Property = {
  id: number;
  name: string;
  slug: string;
  plan: string;
  p24MerchantId: string;
  p24PosId: string;
  p24ApiKey: string;
  p24Crc: string;
  p24Sandbox: boolean;
};

let owner: { user: { id: number }; property: Property };
vi.mock("./auth", () => ({
  requireOwner: async () => owner,
  requireSuperadmin: async () => ({ id: 1 }),
  getSessionUser: async () => owner.user,
  createSession: async () => {},
  destroySession: async () => {},
  SESSION_COOKIE: "rezflow_session",
}));

let faq: { id: number; propertyId: number } | null = null;
let promo: { id: number; propertyId: number; active: boolean } | null = null;
let existingPromo: { id: number } | null = null;
let unitCount = 0;
let p24AccessOk = true;

const propertyUpdates: Record<string, unknown>[] = [];
const faqsCreated: Record<string, unknown>[] = [];
const faqUpdates: { id: number; data: Record<string, unknown> }[] = [];
const faqsDeleted: number[] = [];
const promosCreated: Record<string, unknown>[] = [];
const promoUpdates: { id: number; data: Record<string, unknown> }[] = [];
const promosDeleted: number[] = [];
const events: { kind: string; level?: string; message: string }[] = [];

vi.mock("./db", () => ({
  prisma: {
    property: {
      findUnique: async () => owner.property,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        propertyUpdates.push(data);
      },
    },
    propertyFaq: {
      findUnique: async () => faq,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        faqsCreated.push(data);
      },
      update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
        faqUpdates.push({ id: where.id, data });
      },
      delete: async ({ where }: { where: { id: number } }) => {
        faqsDeleted.push(where.id);
      },
    },
    promoCode: {
      findUnique: async ({ where }: { where: { id?: number; propertyId_code?: unknown } }) =>
        where.propertyId_code !== undefined ? existingPromo : promo,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        promosCreated.push(data);
      },
      update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
        promoUpdates.push({ id: where.id, data });
      },
      delete: async ({ where }: { where: { id: number } }) => {
        promosDeleted.push(where.id);
      },
    },
    unit: { count: async () => unitCount },
    pricingRule: { findMany: async () => [] },
  },
}));

vi.mock("./payments", async (importOriginal) => {
  const original = await importOriginal<typeof import("./payments")>();
  return { ...original, testP24Access: async () => p24AccessOk };
});

vi.mock("./mailer", () => ({ sendMail: async () => {} }));
vi.mock("./sms", () => ({ sendSms: async () => {} }));
vi.mock("./log", () => ({
  logEvent: async (e: (typeof events)[number]) => void events.push(e),
}));
vi.mock("./rate-limit", () => ({ rateLimitOrRedirect: async () => {}, rateLimit: async () => true }));
vi.mock("./channex/enqueue-helpers", () => ({ afterAri: async () => {}, syncUnitRange: async () => {} }));
vi.mock("./ical", () => ({ syncIcalFeed: async () => ({ ok: true, imported: 0 }) }));
vi.mock("./photos", () => ({ savePhotoFile: async () => "", deletePhotoFile: async () => {} }));

const {
  addPropertyFaq,
  clearPaymentSettings,
  createPromoCode,
  deletePromoCode,
  deletePropertyFaq,
  ownerSetPlan,
  testP24Connection,
  togglePromoCode,
  updatePaymentSettings,
  updateProperty,
  updatePropertyFaq,
} = await import("./actions");
const { planDef } = await import("./plans");

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
  owner = {
    user: { id: 5 },
    property: {
      id: 3,
      name: "Willa Pod Dębem",
      slug: "willa-pod-debem",
      plan: "STANDARD",
      p24MerchantId: "12345",
      p24PosId: "12345",
      p24ApiKey: "stary-klucz",
      p24Crc: "stary-crc",
      p24Sandbox: true,
    },
  };
  faq = { id: 41, propertyId: 3 };
  promo = { id: 51, propertyId: 3, active: true };
  existingPromo = null;
  unitCount = 0;
  p24AccessOk = true;
  propertyUpdates.length = 0;
  faqsCreated.length = 0;
  faqUpdates.length = 0;
  faqsDeleted.length = 0;
  promosCreated.length = 0;
  promoUpdates.length = 0;
  promosDeleted.length = 0;
  events.length = 0;
});

describe("updateProperty", () => {
  const VALID = {
    name: "Willa Pod Dębem",
    description: "Opis",
    address: "Zakopane",
    checkInFrom: "15:00",
    checkOutTo: "11:00",
    depositPercent: "30",
    terms: "Regulamin",
    privacyPolicy: "Polityka",
    arrivalInfo: "Kod do bramy",
    sellerName: "Willa sp. z o.o.",
    sellerNip: "1234567890",
    sellerAddress: "Zakopane 1",
    bankAccount: "PL61109010140000071219812874",
  };

  it("zapisuje dane obiektu razem z danymi do faktur", async () => {
    expect(await target(updateProperty(form(VALID)))).toBe("/admin/obiekt?saved=1");

    expect(propertyUpdates[0]).toMatchObject({
      name: "Willa Pod Dębem",
      depositPercent: 30,
      sellerNip: "1234567890",
      arrivalInfo: "Kod do bramy",
    });
  });

  it("odrzuca krótką nazwę i zły format godzin", async () => {
    expect(await target(updateProperty(form({ ...VALID, name: "Ab" })))).toContain("za krótka");
    expect(await target(updateProperty(form({ ...VALID, checkInFrom: "15" })))).toContain("HH:MM");
    expect(await target(updateProperty(form({ ...VALID, checkOutTo: "godzina 11" })))).toContain(
      "HH:MM"
    );
    expect(propertyUpdates).toEqual([]);
  });

  it("zaliczka musi być procentem 0–100", async () => {
    for (const depositPercent of ["-1", "101", "30,5", "abc"]) {
      const to = await target(updateProperty(form({ ...VALID, depositPercent })));
      expect(to, `depositPercent=${depositPercent}`).toContain("0–100");
    }

    await target(updateProperty(form({ ...VALID, depositPercent: "0" })));
    expect(propertyUpdates).toHaveLength(1); // przedpłata wyłączona to poprawny wybór
  });
});

describe("updatePaymentSettings", () => {
  it("zapisuje identyfikatory i tryb piaskownicy", async () => {
    await target(
      updatePaymentSettings(
        form({ p24MerchantId: "54321", p24PosId: "54321", p24ApiKey: "nowy", p24Crc: "nowy-crc", p24Sandbox: "on" })
      )
    );

    expect(propertyUpdates[0]).toMatchObject({
      p24MerchantId: "54321",
      p24PosId: "54321",
      p24ApiKey: "nowy",
      p24Crc: "nowy-crc",
      p24Sandbox: true,
    });
    expect(events[0]).toMatchObject({ kind: "ADMIN" });
  });

  it("puste pola sekretów zostawiają dotychczasowe wartości", async () => {
    // formularz nie prefilluje klucza ani CRC — puste pole znaczy „nie zmieniam"
    await target(
      updatePaymentSettings(form({ p24MerchantId: "54321", p24PosId: "54321", p24ApiKey: "", p24Crc: "" }))
    );

    expect(propertyUpdates[0]).toMatchObject({
      p24ApiKey: "stary-klucz",
      p24Crc: "stary-crc",
    });
  });

  it("pusty POS ID domyśla się Merchant ID", async () => {
    // w większości umów to ten sam numer, a puste pole zablokowałoby bramkę
    await target(updatePaymentSettings(form({ p24MerchantId: "54321", p24PosId: "" })));

    expect(propertyUpdates[0]).toMatchObject({ p24PosId: "54321" });
  });

  it("odznaczony przełącznik oznacza tryb produkcyjny", async () => {
    await target(updatePaymentSettings(form({ p24MerchantId: "54321", p24PosId: "54321" })));

    expect(propertyUpdates[0]).toMatchObject({ p24Sandbox: false });
  });

  it("identyfikatory muszą być liczbami", async () => {
    // niepoprawny numer i tak zostałby odrzucony przez P24, ale dopiero
    // przy pierwszej płatności gościa
    expect(
      await target(updatePaymentSettings(form({ p24MerchantId: "abc123", p24PosId: "" })))
    ).toContain("Merchant ID");
    expect(
      await target(updatePaymentSettings(form({ p24MerchantId: "12345", p24PosId: "12-345" })))
    ).toContain("POS ID");
    expect(propertyUpdates).toEqual([]);
  });

  it("wyczyszczenie Merchant ID jest dozwolone — wyłącza bramkę", async () => {
    await target(updatePaymentSettings(form({ p24MerchantId: "", p24PosId: "" })));

    expect(propertyUpdates[0]).toMatchObject({ p24MerchantId: "", p24PosId: "" });
  });
});

describe("clearPaymentSettings", () => {
  it("kasuje wszystkie dane bramki i wraca do piaskownicy, notując to ostrzeżeniem", async () => {
    expect(await target(clearPaymentSettings())).toBe(
      "/admin/platnosci/konfiguracja?cleared=1"
    );

    expect(propertyUpdates[0]).toEqual({
      p24MerchantId: "",
      p24PosId: "",
      p24ApiKey: "",
      p24Crc: "",
      p24Sandbox: true,
    });
    expect(events[0]).toMatchObject({ level: "WARN" });
  });
});

describe("testP24Connection", () => {
  it("poprawne dane dostępowe dają wynik „ok”", async () => {
    expect(await target(testP24Connection())).toBe("/admin/platnosci/konfiguracja?test=ok");
  });

  it("odrzucone dane dają wynik „fail”", async () => {
    p24AccessOk = false;
    expect(await target(testP24Connection())).toBe("/admin/platnosci/konfiguracja?test=fail");
  });

  it("niepełna konfiguracja nie dzwoni do operatora", async () => {
    owner.property.p24ApiKey = "";

    expect(await target(testP24Connection())).toBe(
      "/admin/platnosci/konfiguracja?test=missing"
    );
  });
});

describe("ownerSetPlan", () => {
  it("podniesienie planu przechodzi bez pytania o jednostki", async () => {
    await target(ownerSetPlan(form({ plan: "PRO" })));

    expect(propertyUpdates).toEqual([{ plan: "PRO" }]);
  });

  it("obniżenie planu jest blokowane, gdy jednostek jest za dużo", async () => {
    // inaczej obiekt zostałby z jednostkami, których plan nie obsługuje,
    // a limit przy dodawaniu przestałby cokolwiek znaczyć
    const free = planDef("FREE");
    unitCount = (free.maxUnits ?? 0) + 1;

    const to = await target(ownerSetPlan(form({ plan: "FREE" })));

    expect(to).toContain("Usuń nadmiarowe jednostki");
    expect(propertyUpdates).toEqual([]);
  });

  it("obniżenie w granicach limitu przechodzi", async () => {
    const free = planDef("FREE");
    unitCount = free.maxUnits ?? 0;

    await target(ownerSetPlan(form({ plan: "FREE" })));

    expect(propertyUpdates).toEqual([{ plan: "FREE" }]);
  });

  it("wybór aktualnego planu nie zapisuje nic", async () => {
    expect(await target(ownerSetPlan(form({ plan: "STANDARD" })))).toBe("/admin/plan");
    expect(propertyUpdates).toEqual([]);
  });

  it("nieznany plan jest odrzucany", async () => {
    expect(await target(ownerSetPlan(form({ plan: "ENTERPRISE" })))).toContain("Nieznany plan");
    expect(propertyUpdates).toEqual([]);
  });
});

describe("FAQ obiektu", () => {
  const VALID = { question: "Czy jest parking?", answer: "Tak, bezpłatny." };

  it("dodaje pytanie z odpowiedzią", async () => {
    await target(addPropertyFaq(form(VALID)));

    expect(faqsCreated[0]).toMatchObject({ propertyId: 3, ...VALID });
  });

  it("odrzuca zbyt krótkie pytanie i brak odpowiedzi", async () => {
    expect(await target(addPropertyFaq(form({ ...VALID, question: "Ile" })))).toContain(
      "za krótkie"
    );
    expect(await target(addPropertyFaq(form({ ...VALID, answer: "-" })))).toContain(
      "Dopisz odpowiedź"
    );
    expect(faqsCreated).toEqual([]);
  });

  it("edytuje własne pytanie", async () => {
    await target(updatePropertyFaq(form({ id: "41", ...VALID })));

    expect(faqUpdates).toEqual([{ id: 41, data: VALID }]);
  });

  it("pytanie z cudzego obiektu jest nietykalne", async () => {
    faq!.propertyId = 999;

    expect(await target(updatePropertyFaq(form({ id: "41", ...VALID })))).toBe("/admin/obiekt");
    expect(faqUpdates).toEqual([]);
  });

  it("usuwa własne pytanie, cudzego nie", async () => {
    await target(deletePropertyFaq(form({ id: "41" })));
    expect(faqsDeleted).toEqual([41]);

    faqsDeleted.length = 0;
    faq!.propertyId = 999;
    await target(deletePropertyFaq(form({ id: "41" })));
    expect(faqsDeleted).toEqual([]);
  });
});

describe("kody promocyjne", () => {
  const VALID = {
    code: "wakacje10",
    percentOff: "10",
    validFrom: "2026-07-01",
    validTo: "2026-08-31",
    maxUses: "100",
  };

  it("zapisuje kod wielkimi literami", async () => {
    // gość wpisuje go dowolnie, a porównanie jest dokładne
    await target(createPromoCode(form(VALID)));

    expect(promosCreated[0]).toMatchObject({
      propertyId: 3,
      code: "WAKACJE10",
      percentOff: 10,
      maxUses: 100,
    });
  });

  it("duplikat kodu w tym samym obiekcie jest odrzucany", async () => {
    existingPromo = { id: 9 };

    const to = await target(createPromoCode(form(VALID)));

    expect(to).toContain("już istnieje");
    expect(promosCreated).toEqual([]);
  });

  it("format kodu jest ograniczony do liter, cyfr i myślnika", async () => {
    for (const code of ["ab", "x".repeat(25), "kod z spacja", "kod@!"]) {
      const to = await target(createPromoCode(form({ ...VALID, code })));
      expect(to, `code=${code}`).toContain("3–24 znaki");
    }
    expect(promosCreated).toEqual([]);
  });

  it("rabat musi być w zakresie 1–90%", async () => {
    for (const percentOff of ["0", "91", "10.5", "abc"]) {
      const to = await target(createPromoCode(form({ ...VALID, percentOff })));
      expect(to, `percentOff=${percentOff}`).toContain("1–90");
    }
  });

  it("daty ważności są nieobowiązkowe, ale muszą być poprawne", async () => {
    await target(createPromoCode(form({ ...VALID, validFrom: "", validTo: "" })));
    expect(promosCreated).toHaveLength(1);

    expect(
      await target(createPromoCode(form({ ...VALID, validFrom: "01.07.2026" })))
    ).toContain("data początku");
    expect(await target(createPromoCode(form({ ...VALID, validTo: "sierpień" })))).toContain(
      "data końca"
    );
  });

  it("brak limitu użyć zapisuje zero, czyli bez limitu", async () => {
    await target(createPromoCode(form({ ...VALID, maxUses: "" })));

    expect(promosCreated[0]).toMatchObject({ maxUses: 0 });
  });

  it("włącza i wyłącza własny kod", async () => {
    await target(togglePromoCode(form({ id: "51" })));
    expect(promoUpdates).toEqual([{ id: 51, data: { active: false } }]);

    promoUpdates.length = 0;
    promo!.active = false;
    await target(togglePromoCode(form({ id: "51" })));
    expect(promoUpdates).toEqual([{ id: 51, data: { active: true } }]);
  });

  it("kod z cudzego obiektu jest nietykalny", async () => {
    promo!.propertyId = 999;

    await target(togglePromoCode(form({ id: "51" })));
    expect(promoUpdates).toEqual([]);

    await target(deletePromoCode(form({ id: "51" })));
    expect(promosDeleted).toEqual([]);
  });

  it("usuwa własny kod", async () => {
    await target(deletePromoCode(form({ id: "51" })));
    expect(promosDeleted).toEqual([51]);
  });
});
