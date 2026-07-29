import { beforeEach, describe, expect, it, vi } from "vitest";
import { routing } from "@/i18n/routing";

// Publiczne API stron WWW obiektów: dostępność dla widgetu kalendarza
// i przełącznik języka. Oba przyjmują ruch bez logowania, więc parametry
// przychodzą od kogokolwiek — a dostępność dodatkowo nie może wyciekać
// z obiektów, które strony jeszcze nie opublikowały.

type UnitType = {
  id: number;
  basePriceGr: number;
  minStay: number;
  seasons: unknown[];
  property: { suspended: boolean; site: { publishedConfig: string | null } | null };
};

let unitType: UnitType | null = null;
let units: {
  reservations: { checkIn: string; checkOut: string }[];
  blocks: { startDate: string; endDate: string }[];
}[] = [];

vi.mock("@/lib/db", () => ({
  prisma: {
    unitType: { findUnique: async () => unitType },
    unit: { findMany: async () => units },
  },
}));

const { GET: availability } = await import("./availability/route");
const { POST: setLocale } = await import("./locale/route");

const published = (over: Partial<UnitType> = {}): UnitType => ({
  id: 5,
  basePriceGr: 20000,
  minStay: 1,
  seasons: [],
  property: { suspended: false, site: { publishedConfig: '{"sections":[]}' } },
  ...over,
});

const ask = (params: Record<string, string>) =>
  availability(
    new Request(`https://willa.pl/api/sites/availability?${new URLSearchParams(params)}`)
  );

beforeEach(() => {
  unitType = published();
  units = [{ reservations: [], blocks: [] }, { reservations: [], blocks: [] }];
});

describe("GET /api/sites/availability", () => {
  it("oddaje komplet dni miesiąca z liczbą wolnych jednostek i ceną", async () => {
    const res = await ask({ unitTypeId: "5", month: "2026-08" });

    expect(res.status).toBe(200);
    const { days } = await res.json();
    expect(days).toHaveLength(31);
    expect(days[0]).toMatchObject({ date: "2026-08-01", free: 2 });
    expect(days[0].priceGr).toBeGreaterThan(0);
  });

  it("zajęta jednostka znika z puli tylko w dniach swojego pobytu", async () => {
    // doba wyjazdu jest już wolna — inaczej widget pokazywałby zajęte
    // o jeden dzień za dużo w każdej rezerwacji
    units = [
      { reservations: [{ checkIn: "2026-08-10", checkOut: "2026-08-12" }], blocks: [] },
      { reservations: [], blocks: [] },
    ];

    const { days } = await (await ask({ unitTypeId: "5", month: "2026-08" })).json();
    const free = (date: string) => days.find((d: { date: string }) => d.date === date).free;

    expect(free("2026-08-09")).toBe(2);
    expect(free("2026-08-10")).toBe(1);
    expect(free("2026-08-11")).toBe(1);
    expect(free("2026-08-12")).toBe(2); // dzień wyjazdu
  });

  it("blokada z kanału zajmuje jednostkę tak samo jak rezerwacja", async () => {
    units = [
      { reservations: [], blocks: [{ startDate: "2026-08-10", endDate: "2026-08-11" }] },
      { reservations: [], blocks: [] },
    ];

    const { days } = await (await ask({ unitTypeId: "5", month: "2026-08" })).json();
    expect(days.find((d: { date: string }) => d.date === "2026-08-10").free).toBe(1);
  });

  it("obiekt bez opublikowanej strony nie wystawia dostępności", async () => {
    // inaczej dane obiektów roboczych dałoby się enumerować po id typu pokoju
    unitType = published({
      property: { suspended: false, site: { publishedConfig: null } },
    });

    expect((await ask({ unitTypeId: "5", month: "2026-08" })).status).toBe(404);
  });

  it("obiekt bez strony WWW w ogóle też nie wystawia dostępności", async () => {
    unitType = published({ property: { suspended: false, site: null } });

    expect((await ask({ unitTypeId: "5", month: "2026-08" })).status).toBe(404);
  });

  it("obiekt zawieszony przestaje wystawiać dostępność", async () => {
    unitType = published({
      property: { suspended: true, site: { publishedConfig: '{"sections":[]}' } },
    });

    expect((await ask({ unitTypeId: "5", month: "2026-08" })).status).toBe(404);
  });

  it("nieznany typ pokoju to 404, a nie pusty kalendarz", async () => {
    unitType = null;
    expect((await ask({ unitTypeId: "999", month: "2026-08" })).status).toBe(404);
  });

  it("odrzuca parametry, które nie są miesiącem ani dodatnim id", async () => {
    const bad = [
      { unitTypeId: "5", month: "2026-13" },
      { unitTypeId: "5", month: "2026-00" },
      { unitTypeId: "5", month: "sierpien" },
      { unitTypeId: "5", month: "2026-08-01" },
      { unitTypeId: "0", month: "2026-08" },
      { unitTypeId: "-1", month: "2026-08" },
      { unitTypeId: "abc", month: "2026-08" },
      { unitTypeId: "5.5", month: "2026-08" },
      {},
    ];

    for (const params of bad) {
      const res = await ask(params as Record<string, string>);
      expect(res.status, JSON.stringify(params)).toBe(400);
    }
  });

  it("pozwala na krótki cache — kalendarz nie musi być natychmiastowy", async () => {
    const res = await ask({ unitTypeId: "5", month: "2026-08" });
    expect(res.headers.get("cache-control")).toContain("max-age=60");
  });
});

describe("POST /api/sites/locale", () => {
  const post = (body: unknown) =>
    setLocale(
      new Request("https://willa.pl/api/sites/locale", {
        method: "POST",
        body: typeof body === "string" ? body : JSON.stringify(body),
      })
    );

  it("zapisuje wybrany język w ciasteczku na rok", async () => {
    const res = await post({ locale: "en" });

    expect(res.status).toBe(200);
    const cookie = res.cookies.get("SITE_LOCALE")!;
    expect(cookie.value).toBe("en");
    expect(cookie.maxAge).toBe(365 * 24 * 3600);
    expect(cookie.path).toBe("/");
  });

  it("przyjmuje każdy obsługiwany język", async () => {
    for (const locale of routing.locales) {
      const res = await post({ locale });
      expect(res.status, locale).toBe(200);
    }
  });

  it("nieobsługiwany język odrzuca zamiast zapisywać", async () => {
    // wartość trafia potem do next-intl; nieznany kod wywróciłby render strony
    for (const locale of ["fr", "PL", "pl-PL", "../../etc", ""]) {
      const res = await post({ locale });
      expect(res.status, locale).toBe(400);
      expect(res.cookies.get("SITE_LOCALE")).toBeUndefined();
    }
  });

  it("brak pola i zły typ też są odrzucane", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ locale: 42 })).status).toBe(400);
    expect((await post("to nie json")).status).toBe(400);
  });
});
