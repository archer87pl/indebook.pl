import { beforeEach, describe, expect, it, vi } from "vitest";

// Struktura obiektu: typy pokoi i jednostki. Dwie rzeczy są tu nieoczywiste
// i obie mają konsekwencje finansowe: limit jednostek zależy od planu (i musi
// być liczony PRZED zapisem, razem z tym, co już jest), a usunięcie czegoś,
// co ma rezerwacje — także historyczne — jest zablokowane, bo na tych
// rekordach opierają się rozliczenia i faktury.

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
  property: { id: 3, name: "Willa", plan: "STANDARD", syncMode: "OFF", depositPercent: 30 },
};
vi.mock("./auth", () => ({
  requireOwner: async () => owner,
  requireSuperadmin: async () => ({ id: 1 }),
  getSessionUser: async () => owner.user,
  createSession: async () => {},
  destroySession: async () => {},
  SESSION_COOKIE: "rezflow_session",
}));

let unitType: { id: number; propertyId: number; seasons: unknown[]; property: unknown } | null = null;
let unit: { id: number; unitTypeId: number; active: boolean; unitType: { propertyId: number } } | null =
  null;
let unitCount = 0;
let reservationCount = 0;

const unitTypesCreated: Record<string, unknown>[] = [];
const unitTypeUpdates: { id: number; data: Record<string, unknown> }[] = [];
const unitTypesDeleted: number[] = [];
const unitsCreated: Record<string, unknown>[] = [];
const unitUpdates: { id: number; data: Record<string, unknown> }[] = [];
const unitsDeleted: number[] = [];
const unitsDeletedMany: Record<string, unknown>[] = [];
const ariCalls: { propertyId: number; unitTypeId: number; from: string; to: string }[] = [];

vi.mock("./db", () => ({
  prisma: {
    unitType: {
      findUnique: async () => unitType,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        unitTypesCreated.push(data);
      },
      update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
        unitTypeUpdates.push({ id: where.id, data });
      },
      delete: async ({ where }: { where: { id: number } }) => {
        unitTypesDeleted.push(where.id);
      },
    },
    unit: {
      findUnique: async () => unit,
      count: async () => unitCount,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        unitsCreated.push(data);
      },
      update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
        unitUpdates.push({ id: where.id, data });
      },
      delete: async ({ where }: { where: { id: number } }) => {
        unitsDeleted.push(where.id);
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        unitsDeletedMany.push(where);
        return { count: 0 };
      },
    },
    reservation: { count: async () => reservationCount },
    block: { deleteMany: async () => ({ count: 0 }) },
    rateSeason: { deleteMany: async () => ({ count: 0 }) },
    property: { findUnique: async () => null },
    pricingRule: { findMany: async () => [] },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

vi.mock("./mailer", () => ({ sendMail: async () => {} }));
vi.mock("./sms", () => ({ sendSms: async () => {} }));
vi.mock("./log", () => ({ logEvent: async () => {} }));
vi.mock("./rate-limit", () => ({ rateLimitOrRedirect: async () => {}, rateLimit: async () => true }));
vi.mock("./channex/enqueue-helpers", () => ({
  afterAri: async (propertyId: number, unitTypeId: number, from: string, to: string) => {
    ariCalls.push({ propertyId, unitTypeId, from, to });
  },
  syncUnitRange: async () => {},
}));
vi.mock("./ical", () => ({ syncIcalFeed: async () => ({ ok: true, imported: 0 }) }));
vi.mock("./photos", () => ({ savePhotoFile: async () => "", deletePhotoFile: async () => {} }));

const { addUnit, createUnitType, deleteUnit, deleteUnitType, toggleUnitActive, updateUnitType } =
  await import("./actions");
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
    property: { id: 3, name: "Willa", plan: "STANDARD", syncMode: "OFF", depositPercent: 30 },
  };
  unitType = { id: 7, propertyId: 3, seasons: [], property: { id: 3 } };
  unit = { id: 101, unitTypeId: 7, active: true, unitType: { propertyId: 3 } };
  unitCount = 0;
  reservationCount = 0;
  unitTypesCreated.length = 0;
  unitTypeUpdates.length = 0;
  unitTypesDeleted.length = 0;
  unitsCreated.length = 0;
  unitUpdates.length = 0;
  unitsDeleted.length = 0;
  unitsDeletedMany.length = 0;
  ariCalls.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 30, 12, 0, 0));
});

describe("createUnitType", () => {
  const VALID = {
    name: "Dwuosobowy",
    description: "Z widokiem",
    maxGuests: "2",
    basePriceZl: "200,00",
    minStay: "2",
    unitsCount: "3",
  };

  it("tworzy typ pokoju wraz z zadaną liczbą jednostek", async () => {
    await target(createUnitType(form(VALID)));

    expect(unitTypesCreated[0]).toMatchObject({
      propertyId: 3,
      name: "Dwuosobowy",
      maxGuests: 2,
      basePriceGr: 20000,
      minStay: 2,
    });
    const units = (unitTypesCreated[0].units as { create: { name: string }[] }).create;
    expect(units.map((u) => u.name)).toEqual(["1", "2", "3"]);
  });

  it("każda jednostka dostaje własny sekret feedu iCal", async () => {
    // adres eksportu zawiera ten token; wspólny dla wszystkich pozwoliłby
    // podejrzeć obłożenie każdej jednostki, znając jeden
    await target(createUnitType(form(VALID)));

    const units = (unitTypesCreated[0].units as { create: { icalToken: string }[] }).create;
    const tokens = units.map((u) => u.icalToken);
    expect(new Set(tokens).size).toBe(3);
    for (const t of tokens) expect(t).toMatch(/^[0-9a-f]{24}$/);
  });

  it("limit jednostek w planie liczy się razem z tym, co już jest", async () => {
    // sprawdzenie tylko nowej porcji pozwoliłoby obejść limit,
    // dodając typy po kilka jednostek
    const plan = planDef("STANDARD");
    unitCount = (plan.maxUnits ?? 100) - 1;

    const to = await target(createUnitType(form({ ...VALID, unitsCount: "3" })));

    expect(to).toContain("maks.");
    expect(unitTypesCreated).toEqual([]);
  });

  it("mieszcząc się dokładnie w limicie, przechodzi", async () => {
    const plan = planDef("STANDARD");
    unitCount = (plan.maxUnits ?? 100) - 3;

    await target(createUnitType(form({ ...VALID, unitsCount: "3" })));

    expect(unitTypesCreated).toHaveLength(1);
  });

  it("plan bez limitu nie odpytuje o liczbę jednostek", async () => {
    owner.property.plan = "PRO";
    unitCount = 9999;

    await target(createUnitType(form({ ...VALID, unitsCount: "50" })));

    expect(unitTypesCreated).toHaveLength(1);
  });

  it("odrzuca nazwę, liczbę gości, cenę i liczbę jednostek poza zakresem", async () => {
    const cases: [Partial<typeof VALID>, string][] = [
      [{ name: "A" }, "nazwę typu pokoju"],
      [{ maxGuests: "0" }, "liczba gości"],
      [{ maxGuests: "31" }, "liczba gości"],
      [{ maxGuests: "2.5" }, "liczba gości"],
      [{ basePriceZl: "0" }, "cena bazowa"],
      [{ basePriceZl: "dużo" }, "cena bazowa"],
      [{ unitsCount: "0" }, "między 1 a 50"],
      [{ unitsCount: "51" }, "między 1 a 50"],
    ];

    for (const [override, expected] of cases) {
      const to = await target(createUnitType(form({ ...VALID, ...override })));
      expect(to, JSON.stringify(override)).toContain(expected);
    }
    expect(unitTypesCreated).toEqual([]);
  });

  it("minimalny pobyt nigdy nie schodzi poniżej jednej nocy", async () => {
    await target(createUnitType(form({ ...VALID, minStay: "0" })));
    expect(unitTypesCreated[0]).toMatchObject({ minStay: 1 });
  });

  it("zapisuje tylko znane udogodnienia", async () => {
    // wartości przychodzą z pól wyboru w formularzu, czyli od klienta
    const fd = form(VALID);
    fd.append("amenities", "wifi");
    fd.append("amenities", "wymyslone-udogodnienie");

    await target(createUnitType(fd));

    const amenities = JSON.parse(String(unitTypesCreated[0].amenities)) as string[];
    expect(amenities).toContain("wifi");
    expect(amenities).not.toContain("wymyslone-udogodnienie");
  });
});

describe("updateUnitType", () => {
  const VALID = { id: "7", name: "Dwuosobowy plus", description: "Opis", maxGuests: "3" };

  it("zapisuje zmienione dane", async () => {
    await target(updateUnitType(form(VALID)));

    expect(unitTypeUpdates[0]).toMatchObject({
      id: 7,
      data: { name: "Dwuosobowy plus", maxGuests: 3 },
    });
  });

  it("nie rusza ceny bazowej — ta ma własną akcję unieważniającą rekomendacje", async () => {
    await target(updateUnitType(form({ ...VALID, basePriceZl: "999" })));

    expect(unitTypeUpdates[0].data).not.toHaveProperty("basePriceGr");
  });

  it("cudzy typ pokoju jest nietykalny", async () => {
    unitType!.propertyId = 999;

    expect(await target(updateUnitType(form(VALID)))).toBe("/admin/pokoje");
    expect(unitTypeUpdates).toEqual([]);
  });

  it("odrzuca krótką nazwę i błędną liczbę gości", async () => {
    expect(await target(updateUnitType(form({ ...VALID, name: "A" })))).toContain("nazwę");
    expect(await target(updateUnitType(form({ ...VALID, maxGuests: "99" })))).toContain(
      "liczba gości"
    );
    expect(unitTypeUpdates).toEqual([]);
  });
});

describe("deleteUnitType", () => {
  it("usuwa typ pokoju razem z sezonami, blokadami i jednostkami", async () => {
    await target(deleteUnitType(form({ id: "7" })));

    expect(unitTypesDeleted).toEqual([7]);
    expect(unitsDeletedMany).toEqual([{ unitTypeId: 7 }]);
  });

  it("typ pokoju z rezerwacjami — także historycznymi — jest nieusuwalny", async () => {
    // na tych rekordach opierają się faktury i rozliczenia z OTA
    reservationCount = 1;

    const to = await target(deleteUnitType(form({ id: "7" })));

    expect(to).toContain("rezerwacje");
    expect(unitTypesDeleted).toEqual([]);
  });

  it("cudzy typ pokoju jest nieusuwalny", async () => {
    unitType!.propertyId = 999;

    expect(await target(deleteUnitType(form({ id: "7" })))).toBe("/admin/pokoje");
    expect(unitTypesDeleted).toEqual([]);
  });
});

describe("addUnit", () => {
  it("dodaje jednostkę z własnym sekretem feedu", async () => {
    await target(addUnit(form({ unitTypeId: "7", name: "4" })));

    expect(unitsCreated[0]).toMatchObject({ unitTypeId: 7, name: "4" });
    expect(String(unitsCreated[0].icalToken)).toMatch(/^[0-9a-f]{24}$/);
  });

  it("limit planu blokuje dodanie ponad stan", async () => {
    const plan = planDef("STANDARD");
    unitCount = plan.maxUnits ?? 100;

    const to = await target(addUnit(form({ unitTypeId: "7", name: "4" })));

    expect(to).toContain("maks.");
    expect(unitsCreated).toEqual([]);
  });

  it("bez nazwy jednostka nie powstaje", async () => {
    expect(await target(addUnit(form({ unitTypeId: "7", name: "" })))).toContain("nazwę/numer");
    expect(unitsCreated).toEqual([]);
  });

  it("cudzy typ pokoju nie dostaje jednostki", async () => {
    unitType!.propertyId = 999;

    expect(await target(addUnit(form({ unitTypeId: "7", name: "4" })))).toBe("/admin/pokoje");
    expect(unitsCreated).toEqual([]);
  });
});

describe("toggleUnitActive", () => {
  it("wyłącza jednostkę ze sprzedaży i włącza ponownie", async () => {
    await target(toggleUnitActive(form({ id: "101" })));
    expect(unitUpdates).toEqual([{ id: 101, data: { active: false } }]);

    unitUpdates.length = 0;
    unit!.active = false;
    await target(toggleUnitActive(form({ id: "101" })));
    expect(unitUpdates).toEqual([{ id: 101, data: { active: true } }]);
  });

  it("w trybie Channex przelicza cały horyzont sprzedaży", async () => {
    // liczba pokoi wystawiona do kanału zmienia się dla każdej doby wprzód,
    // więc push musi objąć pełne okno, nie jeden termin
    owner.property.syncMode = "CHANNEX";

    await target(toggleUnitActive(form({ id: "101" })));

    expect(ariCalls).toEqual([
      { propertyId: 3, unitTypeId: 7, from: "2026-07-30", to: "2028-01-21" },
    ]);
  });

  it("bez Channex nie zleca pushu", async () => {
    await target(toggleUnitActive(form({ id: "101" })));
    expect(ariCalls).toEqual([]);
  });

  it("cudza jednostka jest nietykalna", async () => {
    unit!.unitType.propertyId = 999;

    await target(toggleUnitActive(form({ id: "101" })));

    expect(unitUpdates).toEqual([]);
  });
});

describe("deleteUnit", () => {
  it("usuwa jednostkę razem z jej blokadami", async () => {
    await target(deleteUnit(form({ id: "101" })));

    expect(unitsDeleted).toEqual([101]);
  });

  it("jednostka z rezerwacjami jest nieusuwalna", async () => {
    reservationCount = 2;

    const to = await target(deleteUnit(form({ id: "101" })));

    expect(to).toContain("rezerwacje");
    expect(unitsDeleted).toEqual([]);
  });

  it("cudza jednostka jest nieusuwalna", async () => {
    unit!.unitType.propertyId = 999;

    expect(await target(deleteUnit(form({ id: "101" })))).toBe("/admin/pokoje");
    expect(unitsDeleted).toEqual([]);
  });
});
