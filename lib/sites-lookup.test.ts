import { beforeEach, describe, expect, it, vi } from "vitest";

// Odczyt strony WWW obiektu po kluczu z proxy. Kształt zapytania jest tutaj
// zabezpieczeniem: dopasowanie domeny własnej BEZ warunku VERIFIED pozwoliłoby
// wpisać w panelu cudzą domenę i serwować pod nią własną treść.
// (siteRevalidatePaths ma testy w sites.test.ts.)

type Query = { where: Record<string, unknown>; include?: unknown };

const queries: Query[] = [];
let found: unknown = null;

vi.mock("./db", () => ({
  prisma: {
    site: {
      findFirst: async (args: Query) => {
        queries.push(args);
        return found;
      },
      findUnique: async (args: Query) => {
        queries.push(args);
        return found;
      },
    },
  },
}));

const { getSiteByKey, getSiteForProperty } = await import("./sites");

beforeEach(() => {
  queries.length = 0;
  found = { id: 21, subdomain: "willa" };
});

describe("getSiteByKey", () => {
  it("dopasowuje po subdomenie ALBO po domenie własnej", async () => {
    await getSiteByKey("willa");

    expect(queries[0].where.OR).toEqual([
      { subdomain: "willa" },
      { customDomain: "willa", domainStatus: "VERIFIED" },
    ]);
  });

  it("domena własna liczy się WYŁĄCZNIE po weryfikacji", async () => {
    // bez tego warunku wystarczyłoby wpisać w panelu cudzą domenę, żeby
    // serwować pod nią swoją treść, gdy tylko DNS kiedyś na nas wskaże
    await getSiteByKey("willa.pl");

    const byDomain = (queries[0].where.OR as Record<string, unknown>[])[1];
    expect(byDomain).toMatchObject({ domainStatus: "VERIFIED" });
  });

  it("subdomena nie wymaga weryfikacji — jest nasza", async () => {
    await getSiteByKey("willa");

    const bySubdomain = (queries[0].where.OR as Record<string, unknown>[])[0];
    expect(bySubdomain).toEqual({ subdomain: "willa" });
  });

  it("dociąga dane obiektu potrzebne do renderu strony", async () => {
    // strona pokazuje pokoje, zdjęcia i FAQ — brak include oznaczałby
    // zapytanie po zapytaniu przy każdej sekcji
    await getSiteByKey("willa");

    const include = JSON.stringify(queries[0].include);
    for (const relation of ["property", "photos", "faqs", "unitTypes", "units"]) {
      expect(include, relation).toContain(relation);
    }
  });

  it("brak dopasowania oddaje null", async () => {
    found = null;
    expect(await getSiteByKey("nie-ma-takiej")).toBeNull();
  });
});

describe("getSiteForProperty", () => {
  it("szuka po identyfikatorze obiektu — jedna strona na obiekt", async () => {
    await getSiteForProperty(3);

    expect(queries[0].where).toEqual({ propertyId: 3 });
  });

  it("dociąga te same dane co odczyt publiczny, żeby podgląd był identyczny", async () => {
    await getSiteForProperty(3);

    expect(JSON.stringify(queries[0].include)).toContain("unitTypes");
  });

  it("obiekt bez strony oddaje null", async () => {
    found = null;
    expect(await getSiteForProperty(999)).toBeNull();
  });
});
