import { beforeEach, describe, expect, it, vi } from "vitest";

// Cennik, sezony, reguły cen dynamicznych, widełki i blokady kalendarza.
// Wspólny mianownik: każda zmiana ceny musi unieważnić rekomendacje silnika
// (inaczej gość dalej widzi kwotę policzoną ze starej ceny bazowej), a każda
// zmiana dostępności — trafić do kanałów. Wszystko przez bramkę właściciela:
// identyfikatory przychodzą z formularza, więc cudzy cennik jest nietykalny.

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
  property: { id: 3, name: "Willa", plan: "PRO", depositPercent: 30 },
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
let unit: { id: number; unitType: { propertyId: number } } | null = null;
let season: { id: number; unitTypeId: number; unitType: { propertyId: number } } | null = null;
let block: {
  id: number;
  unitId: number;
  startDate: string;
  endDate: string;
  unit: { unitType: { propertyId: number } };
} | null = null;
let unitTypes: { id: number; basePriceGr: number; minPriceGr: number | null }[] = [];

const unitTypeUpdates: { id: number; data: Record<string, unknown> }[] = [];
const propertyUpdates: Record<string, unknown>[] = [];
const seasonsCreated: Record<string, unknown>[] = [];
const seasonsDeleted: number[] = [];
const ruleUpserts: { where: unknown; create: Record<string, unknown>; update: Record<string, unknown> }[] = [];
const blocksCreated: Record<string, unknown>[] = [];
const blocksDeleted: number[] = [];
const invalidated: number[] = [];
const rateRefreshes: { unitTypeId: number; from: string; to: string }[] = [];
const syncCalls: { unitId: number; from: string; to: string }[] = [];

vi.mock("./db", () => ({
  prisma: {
    unitType: {
      findUnique: async () => unitType,
      findMany: async () => unitTypes,
      update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
        unitTypeUpdates.push({ id: where.id, data });
      },
    },
    property: {
      findUnique: async () => null,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        propertyUpdates.push(data);
      },
    },
    unit: { findUnique: async () => unit },
    rateSeason: {
      findUnique: async () => season,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        seasonsCreated.push(data);
      },
      delete: async ({ where }: { where: { id: number } }) => {
        seasonsDeleted.push(where.id);
      },
    },
    pricingRule: {
      findMany: async () => [],
      upsert: async (args: (typeof ruleUpserts)[number]) => {
        ruleUpserts.push(args);
      },
    },
    block: {
      findUnique: async () => block,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        blocksCreated.push(data);
      },
      delete: async ({ where }: { where: { id: number } }) => {
        blocksDeleted.push(where.id);
      },
    },
  },
}));

vi.mock("./rates/refresh", async (importOriginal) => {
  const original = await importOriginal<typeof import("./rates/refresh")>();
  return {
    ...original,
    invalidateRates: async (unitTypeId: number) => {
      invalidated.push(unitTypeId);
    },
    afterRates: async (unitTypeId: number, from: string, to: string) => {
      rateRefreshes.push({ unitTypeId, from, to });
    },
  };
});

vi.mock("./mailer", () => ({ sendMail: async () => {} }));
vi.mock("./sms", () => ({ sendSms: async () => {} }));
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

const {
  adminAddBlock,
  adminAddSeason,
  adminDeleteBlock,
  adminDeleteSeason,
  adminUpdatePricing,
  savePricingRule,
  saveRateGuards,
  setPricingMode,
} = await import("./actions");

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
    property: { id: 3, name: "Willa", plan: "PRO", depositPercent: 30 },
  };
  unitType = { id: 7, propertyId: 3, seasons: [], property: { id: 3 } };
  unit = { id: 101, unitType: { propertyId: 3 } };
  season = { id: 21, unitTypeId: 7, unitType: { propertyId: 3 } };
  block = {
    id: 31,
    unitId: 101,
    startDate: "2026-08-10",
    endDate: "2026-08-13",
    unit: { unitType: { propertyId: 3 } },
  };
  unitTypes = [{ id: 7, basePriceGr: 20000, minPriceGr: null }];
  unitTypeUpdates.length = 0;
  propertyUpdates.length = 0;
  seasonsCreated.length = 0;
  seasonsDeleted.length = 0;
  ruleUpserts.length = 0;
  blocksCreated.length = 0;
  blocksDeleted.length = 0;
  invalidated.length = 0;
  rateRefreshes.length = 0;
  syncCalls.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 30, 12, 0, 0));
});

describe("adminUpdatePricing", () => {
  it("zapisuje cenę bazową i minimalny pobyt, unieważniając rekomendacje", async () => {
    // bez unieważnienia gość dalej widziałby cenę policzoną ze starej bazy
    await target(adminUpdatePricing(form({ unitTypeId: "7", basePriceZl: "250,00", minStay: "2" })));

    expect(unitTypeUpdates[0]).toMatchObject({ id: 7, data: { basePriceGr: 25000, minStay: 2 } });
    expect(invalidated).toEqual([7]);
  });

  it("minimalny pobyt nigdy nie schodzi poniżej jednej nocy", async () => {
    await target(adminUpdatePricing(form({ unitTypeId: "7", basePriceZl: "250", minStay: "0" })));
    expect(unitTypeUpdates[0].data).toMatchObject({ minStay: 1 });

    unitTypeUpdates.length = 0;
    await target(adminUpdatePricing(form({ unitTypeId: "7", basePriceZl: "250", minStay: "-5" })));
    expect(unitTypeUpdates[0].data).toMatchObject({ minStay: 1 });
  });

  it("nieczytelna lub zerowa cena nie zapisuje nic i nie unieważnia cache'u", async () => {
    for (const basePriceZl of ["", "dużo", "0", "-100"]) {
      await target(adminUpdatePricing(form({ unitTypeId: "7", basePriceZl, minStay: "1" })));
    }
    expect(unitTypeUpdates).toEqual([]);
    expect(invalidated).toEqual([]);
  });

  it("cudzy typ pokoju jest nietykalny", async () => {
    unitType!.propertyId = 999;

    expect(await target(adminUpdatePricing(form({ unitTypeId: "7", basePriceZl: "250" })))).toBe(
      "/admin/cennik"
    );
    expect(unitTypeUpdates).toEqual([]);
  });
});

describe("adminAddSeason", () => {
  const VALID = {
    unitTypeId: "7",
    name: "Sezon letni",
    startDate: "2026-07-01",
    endDate: "2026-08-31",
    priceZl: "300,00",
    minStay: "3",
  };

  it("dodaje sezon i unieważnia rekomendacje typu pokoju", async () => {
    await target(adminAddSeason(form(VALID)));

    expect(seasonsCreated[0]).toMatchObject({
      unitTypeId: 7,
      name: "Sezon letni",
      startDate: "2026-07-01",
      endDate: "2026-08-31",
      priceGr: 30000,
      minStay: 3,
    });
    expect(invalidated).toEqual([7]);
  });

  it("sezon jednodniowy jest dozwolony, odwrócony nie", async () => {
    // sezon może obejmować jeden dzień (np. sylwester), ale nie może kończyć
    // się przed początkiem
    await target(adminAddSeason(form({ ...VALID, startDate: "2026-12-31", endDate: "2026-12-31" })));
    expect(seasonsCreated).toHaveLength(1);

    const to = await target(
      adminAddSeason(form({ ...VALID, startDate: "2026-08-31", endDate: "2026-07-01" }))
    );
    expect(to).toContain("zakres dat sezonu");
    expect(seasonsCreated).toHaveLength(1);
  });

  it("odrzuca cenę nieczytelną, zerową i brak nazwy", async () => {
    expect(await target(adminAddSeason(form({ ...VALID, priceZl: "0" })))).toContain(
      "cena sezonu"
    );
    expect(await target(adminAddSeason(form({ ...VALID, priceZl: "dużo" })))).toContain(
      "cena sezonu"
    );
    expect(await target(adminAddSeason(form({ ...VALID, name: "" })))).toContain("nazwę sezonu");
    expect(seasonsCreated).toEqual([]);
  });

  it("cudzy typ pokoju nie dostaje sezonu", async () => {
    unitType!.propertyId = 999;

    await target(adminAddSeason(form(VALID)));

    expect(seasonsCreated).toEqual([]);
    expect(invalidated).toEqual([]);
  });
});

describe("adminDeleteSeason", () => {
  it("usuwa sezon i unieważnia rekomendacje", async () => {
    await target(adminDeleteSeason(form({ id: "21" })));

    expect(seasonsDeleted).toEqual([21]);
    expect(invalidated).toEqual([7]);
  });

  it("sezon z cudzego obiektu jest nietykalny", async () => {
    season!.unitType.propertyId = 999;

    await target(adminDeleteSeason(form({ id: "21" })));

    expect(seasonsDeleted).toEqual([]);
    expect(invalidated).toEqual([]);
  });

  it("nieistniejący sezon nie wywraca akcji", async () => {
    season = null;

    expect(await target(adminDeleteSeason(form({ id: "999" })))).toBe("/admin/cennik");
    expect(seasonsDeleted).toEqual([]);
  });
});

describe("savePricingRule", () => {
  it("zapisuje regułę weekendową jako jedną na obiekt", async () => {
    // upsert po (obiekt, rodzaj) — dwie reguły tego samego rodzaju
    // nakładałyby się na siebie w nieokreślonej kolejności
    await target(savePricingRule(form({ kind: "WEEKEND", percent: "20", active: "on" })));

    expect(ruleUpserts[0].where).toEqual({ propertyId_kind: { propertyId: 3, kind: "WEEKEND" } });
    expect(ruleUpserts[0].create).toMatchObject({
      propertyId: 3,
      kind: "WEEKEND",
      percent: 20,
      active: true,
    });
  });

  it("brak zaznaczonego przełącznika oznacza regułę wyłączoną", async () => {
    await target(savePricingRule(form({ kind: "WEEKEND", percent: "20" })));

    expect(ruleUpserts[0].update).toMatchObject({ active: false });
  });

  it("korekta ceny musi mieścić się w widełkach od −50% do +100%", async () => {
    for (const percent of ["-51", "101", "1.5", "abc"]) {
      const to = await target(savePricingRule(form({ kind: "WEEKEND", percent })));
      expect(to, `percent=${percent}`).toContain("Korekta ceny");
    }
    expect(ruleUpserts).toEqual([]);
  });

  it("puste pole korekty zapisuje regułę zerową, czyli bezczynną", async () => {
    // Number("") to 0 — reguła przechodzi walidację, ale dyspozytor pobiera
    // tylko te z `percent: { not: 0 }`, więc nie rusza ceny (patrz
    // quote-dynamic.test.ts). Zapis jest wtedy równoważny wyłączeniu reguły.
    await target(savePricingRule(form({ kind: "WEEKEND", percent: "" })));

    expect(ruleUpserts[0].create).toMatchObject({ percent: 0 });
  });

  it("granice zakresu są dozwolone", async () => {
    await target(savePricingRule(form({ kind: "WEEKEND", percent: "-50" })));
    await target(savePricingRule(form({ kind: "WEEKEND", percent: "100" })));

    expect(ruleUpserts).toHaveLength(2);
  });

  it("last minute wymaga liczby dni w zakresie 1–60", async () => {
    for (const param of ["0", "61", "abc"]) {
      const to = await target(
        savePricingRule(form({ kind: "LAST_MINUTE", percent: "-15", param }))
      );
      expect(to, `param=${param}`).toContain("1–60");
    }

    await target(savePricingRule(form({ kind: "LAST_MINUTE", percent: "-15", param: "7" })));
    expect(ruleUpserts).toHaveLength(1);
  });

  it("próg obłożenia wymaga wartości 1–100%", async () => {
    for (const param of ["0", "101", ""]) {
      const to = await target(savePricingRule(form({ kind: "OCCUPANCY", percent: "10", param })));
      expect(to, `param=${param}`).toContain("1–100");
    }

    await target(savePricingRule(form({ kind: "OCCUPANCY", percent: "10", param: "80" })));
    expect(ruleUpserts).toHaveLength(1);
  });

  it("nieznany rodzaj reguły jest odrzucany", async () => {
    expect(await target(savePricingRule(form({ kind: "WYMYSLONA", percent: "10" })))).toBe(
      "/admin/cennik"
    );
    expect(ruleUpserts).toEqual([]);
  });
});

describe("setPricingMode", () => {
  it("włącza SmartRate, zapisuje rynek i czyści poprzedni błąd", async () => {
    await target(
      setPricingMode(form({ pricingMode: "SMARTRATE", smartRateMarketId: "mkt_gdansk" }))
    );

    expect(propertyUpdates[0]).toMatchObject({
      pricingMode: "SMARTRATE",
      smartRateMarketId: "mkt_gdansk",
      smartRateError: "",
    });
  });

  it("zmiana trybu unieważnia rekomendacje wszystkich typów pokoi", async () => {
    // stare rekomendacje policzone innym silnikiem nie mogą przeżyć przełączenia
    unitTypes = [
      { id: 7, basePriceGr: 20000, minPriceGr: 15000 },
      { id: 8, basePriceGr: 30000, minPriceGr: 20000 },
    ];

    await target(setPricingMode(form({ pricingMode: "BASIC", smartRateMarketId: "" })));

    expect(invalidated).toEqual([7, 8]);
  });

  it("pierwsze włączenie uzupełnia widełki wyliczone z ceny bazowej", async () => {
    // bez widełek silnik mógłby oddać cenę oderwaną od cennika
    await target(
      setPricingMode(form({ pricingMode: "SMARTRATE", smartRateMarketId: "mkt_gdansk" }))
    );

    expect(unitTypeUpdates[0]).toMatchObject({
      id: 7,
      data: { minPriceGr: 14000, maxPriceGr: 36000 },
    });
  });

  it("ustawione wcześniej widełki nie są nadpisywane", async () => {
    unitTypes = [{ id: 7, basePriceGr: 20000, minPriceGr: 18000 }];

    await target(
      setPricingMode(form({ pricingMode: "SMARTRATE", smartRateMarketId: "mkt_gdansk" }))
    );

    expect(unitTypeUpdates).toEqual([]);
  });

  it("rozgrzewa tylko okno widoczne w panelu, nie cały horyzont", async () => {
    // pełne 180 dni to setki zapisów ciągnących się długo po odpowiedzi —
    // resztę dobija cron
    await target(
      setPricingMode(form({ pricingMode: "SMARTRATE", smartRateMarketId: "mkt_gdansk" }))
    );

    expect(rateRefreshes).toEqual([
      { unitTypeId: 7, from: "2026-07-30", to: "2026-08-29" },
    ]);
  });

  it("powrót do trybu podstawowego nie rozgrzewa niczego", async () => {
    await target(setPricingMode(form({ pricingMode: "BASIC", smartRateMarketId: "" })));

    expect(rateRefreshes).toEqual([]);
    expect(propertyUpdates[0]).toMatchObject({ pricingMode: "BASIC" });
  });

  it("plan bez SmartRate nie pozwala włączyć trybu", async () => {
    owner.property.plan = "STANDARD";

    const to = await target(
      setPricingMode(form({ pricingMode: "SMARTRATE", smartRateMarketId: "mkt_gdansk" }))
    );

    expect(to).toContain("Pro");
    expect(propertyUpdates).toEqual([]);
  });

  it("SmartRate bez wybranego rynku jest odrzucany", async () => {
    const to = await target(
      setPricingMode(form({ pricingMode: "SMARTRATE", smartRateMarketId: "" }))
    );

    expect(to).toContain("rynek");
    expect(propertyUpdates).toEqual([]);
  });

  it("nieznany tryb degraduje do podstawowego, zamiast zapisać śmieć", async () => {
    await target(setPricingMode(form({ pricingMode: "WYMYSLONY", smartRateMarketId: "" })));

    expect(propertyUpdates[0]).toMatchObject({ pricingMode: "BASIC" });
  });

  it("identyfikator rynku jest przycinany do długości kolumny", async () => {
    await target(
      setPricingMode(form({ pricingMode: "BASIC", smartRateMarketId: "x".repeat(200) }))
    );

    expect(String(propertyUpdates[0].smartRateMarketId)).toHaveLength(60);
  });
});

describe("saveRateGuards", () => {
  it("zapisuje widełki i unieważnia rekomendacje", async () => {
    await target(
      saveRateGuards(form({ unitTypeId: "7", minPriceZl: "150,00", maxPriceZl: "400,00" }))
    );

    expect(unitTypeUpdates[0]).toMatchObject({
      id: 7,
      data: { minPriceGr: 15000, maxPriceGr: 40000 },
    });
    expect(invalidated).toEqual([7]);
  });

  it("odwrócone widełki są odrzucane", async () => {
    // min > max oznaczałby, że silnik nie ma z czego wybierać
    const to = await target(
      saveRateGuards(form({ unitTypeId: "7", minPriceZl: "400", maxPriceZl: "150" }))
    );

    expect(to).toContain("nie może być wyższa");
    expect(unitTypeUpdates).toEqual([]);
  });

  it("równe widełki są dozwolone — cena sztywna", async () => {
    await target(saveRateGuards(form({ unitTypeId: "7", minPriceZl: "200", maxPriceZl: "200" })));

    expect(unitTypeUpdates).toHaveLength(1);
  });

  it("odrzuca wartości niebędące liczbami i zerowe minimum", async () => {
    for (const [minPriceZl, maxPriceZl] of [
      ["", "400"],
      ["dużo", "400"],
      ["150", "mało"],
      ["0", "400"],
    ]) {
      const to = await target(saveRateGuards(form({ unitTypeId: "7", minPriceZl, maxPriceZl })));
      expect(to, `${minPriceZl}/${maxPriceZl}`).toContain("większymi od zera");
    }
    expect(unitTypeUpdates).toEqual([]);
  });

  it("cudzy typ pokoju jest nietykalny", async () => {
    unitType!.propertyId = 999;

    expect(
      await target(saveRateGuards(form({ unitTypeId: "7", minPriceZl: "150", maxPriceZl: "400" })))
    ).toBe("/admin/cennik");
    expect(unitTypeUpdates).toEqual([]);
  });
});

describe("blokady kalendarza", () => {
  it("dodana blokada trafia do kanałów", async () => {
    // inaczej Booking dalej sprzedawałby zablokowany termin
    await target(
      adminAddBlock(
        form({ unitId: "101", startDate: "2026-09-01", endDate: "2026-09-05", note: "remont" })
      )
    );

    expect(blocksCreated[0]).toMatchObject({
      unitId: 101,
      startDate: "2026-09-01",
      endDate: "2026-09-05",
      note: "remont",
    });
    expect(syncCalls).toEqual([{ unitId: 101, from: "2026-09-01", to: "2026-09-05" }]);
  });

  it("blokada musi mieć dodatnią długość", async () => {
    for (const [startDate, endDate] of [
      ["2026-09-01", "2026-09-01"],
      ["2026-09-05", "2026-09-01"],
      ["nie-data", "2026-09-05"],
    ]) {
      const to = await target(adminAddBlock(form({ unitId: "101", startDate, endDate })));
      expect(to).toContain("zakres blokady");
    }
    expect(blocksCreated).toEqual([]);
  });

  it("cudza jednostka nie da się zablokować", async () => {
    unit!.unitType.propertyId = 999;

    expect(
      await target(
        adminAddBlock(form({ unitId: "101", startDate: "2026-09-01", endDate: "2026-09-05" }))
      )
    ).toBe("/admin/kalendarz");
    expect(blocksCreated).toEqual([]);
  });

  it("usunięta blokada zwalnia termin w kanałach", async () => {
    await target(adminDeleteBlock(form({ id: "31" })));

    expect(blocksDeleted).toEqual([31]);
    expect(syncCalls).toEqual([{ unitId: 101, from: "2026-08-10", to: "2026-08-13" }]);
  });

  it("blokada z cudzego obiektu jest nietykalna", async () => {
    block!.unit.unitType.propertyId = 999;

    await target(adminDeleteBlock(form({ id: "31" })));

    expect(blocksDeleted).toEqual([]);
    expect(syncCalls).toEqual([]);
  });
});
