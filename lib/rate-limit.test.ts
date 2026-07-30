import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Limiter jest kontrolą bezpieczeństwa (brute-force logowania, spam z
// formularzy), a jego stan siedzi w bazie — więc podstawiamy atrapę tabeli
// `rateLimit` i sterujemy zegarem. e2e tego nie sprawdzi: poza produkcją
// limiter celowo przepuszcza wszystko, żeby nie psuć testów przeglądarkowych.

type Row = { key: string; count: number; resetAt: Date };

const rows = new Map<string, Row>();
let failDb = false;

vi.mock("./db", () => ({
  prisma: {
    rateLimit: {
      findUnique: async ({ where }: { where: { key: string } }) => {
        if (failDb) throw new Error("baza padła");
        return rows.get(where.key) ?? null;
      },
      upsert: async ({
        where,
        create,
      }: {
        where: { key: string };
        create: Row;
      }) => {
        rows.set(where.key, { ...create });
      },
      update: async ({ where }: { where: { key: string } }) => {
        const row = rows.get(where.key);
        if (row) row.count += 1;
      },
    },
  },
}));

// Nagłówki żądania podstawiamy per test — od nich zależy klucz licznika
let requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));

// redirect() w Next rzuca; atrapa robi to samo, żeby dało się złapać cel
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

const { clientIp, rateLimit, rateLimitOrRedirect } = await import("./rate-limit");

beforeEach(() => {
  rows.clear();
  failDb = false;
  requestHeaders = new Headers();
  vi.useFakeTimers();
  // NODE_ENV jest read-only w typach Node, a nam potrzeba tu produkcji
  vi.stubEnv("NODE_ENV", "production");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs(); // przywraca NODE_ENV
});

const WINDOW = 10 * 60_000;

describe("rateLimit", () => {
  it("przepuszcza dokładnie tyle żądań, ile wynosi limit", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 6; i++) results.push(await rateLimit("inquiry:1.2.3.4", 5, WINDOW));

    expect(results).toEqual([true, true, true, true, true, false]);
  });

  it("blokuje dalej, dopóki okno się nie zamknie", async () => {
    for (let i = 0; i < 5; i++) await rateLimit("login:1.2.3.4", 5, WINDOW);
    expect(await rateLimit("login:1.2.3.4", 5, WINDOW)).toBe(false);

    // sekundę przed końcem okna wciąż blokada…
    vi.advanceTimersByTime(WINDOW - 1_000);
    expect(await rateLimit("login:1.2.3.4", 5, WINDOW)).toBe(false);

    // …a po jego upływie licznik startuje od zera
    vi.advanceTimersByTime(2_000);
    expect(await rateLimit("login:1.2.3.4", 5, WINDOW)).toBe(true);
    expect(rows.get("login:1.2.3.4")?.count).toBe(1);
  });

  it("liczy każdy klucz osobno", async () => {
    for (let i = 0; i < 5; i++) await rateLimit("inquiry:1.2.3.4:strona-a", 5, WINDOW);
    expect(await rateLimit("inquiry:1.2.3.4:strona-a", 5, WINDOW)).toBe(false);

    // inny adres IP i inna strona mają własne wiadra
    expect(await rateLimit("inquiry:9.9.9.9:strona-a", 5, WINDOW)).toBe(true);
    expect(await rateLimit("inquiry:1.2.3.4:strona-b", 5, WINDOW)).toBe(true);
  });

  it("poza produkcją nie hamuje i nie zapisuje nic do bazy", async () => {
    vi.stubEnv("NODE_ENV", "development");

    for (let i = 0; i < 20; i++) {
      expect(await rateLimit("login:1.2.3.4", 5, WINDOW)).toBe(true);
    }
    expect(rows.size).toBe(0);
  });

  it("awaria bazy przepuszcza żądanie, zamiast blokować logowanie", async () => {
    // fail-open jest tu świadomy: padnięty licznik nie może odciąć nikomu
    // dostępu do panelu — właściwa autoryzacja i tak sprawdza hasło
    failDb = true;
    expect(await rateLimit("login:1.2.3.4", 5, WINDOW)).toBe(true);
  });
});

// clientIp czyta nagłówki proxy. Od niego zależy, czy licznik dotyczy jednego
// napastnika, czy wszystkich gości naraz — pomyłka albo nie chroni niczego,
// albo blokuje cały ruch po pierwszym nadużyciu.
describe("clientIp", () => {
  it("bierze pierwszy adres z listy x-forwarded-for", async () => {
    // proxy dokleja swoje adresy z prawej; pierwszy to klient
    requestHeaders = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" });

    expect(await clientIp()).toBe("203.0.113.7");
  });

  it("obcina spacje wokół adresu", async () => {
    requestHeaders = new Headers({ "x-forwarded-for": "  203.0.113.7  , 10.0.0.1" });

    expect(await clientIp()).toBe("203.0.113.7");
  });

  it("bez x-forwarded-for schodzi do x-real-ip", async () => {
    requestHeaders = new Headers({ "x-real-ip": "198.51.100.9" });

    expect(await clientIp()).toBe("198.51.100.9");
  });

  it("bez żadnego nagłówka oddaje stały klucz zastępczy", async () => {
    // „unknown" jest wspólnym wiadrem: gorzej niż per-IP, ale lepiej niż
    // wyłączenie limitu, gdy proxy nie dołoży nagłówka
    requestHeaders = new Headers();

    expect(await clientIp()).toBe("unknown");
  });
});

describe("rateLimitOrRedirect", () => {
  it("w limicie nie przekierowuje", async () => {
    requestHeaders = new Headers({ "x-forwarded-for": "203.0.113.7" });

    await expect(
      rateLimitOrRedirect("login", 5, WINDOW, "/login?error=rate")
    ).resolves.toBeUndefined();
  });

  it("po przekroczeniu limitu przekierowuje na podany adres", async () => {
    requestHeaders = new Headers({ "x-forwarded-for": "203.0.113.7" });
    for (let i = 0; i < 5; i++) await rateLimitOrRedirect("login", 5, WINDOW, "/login?error=rate");

    await expect(rateLimitOrRedirect("login", 5, WINDOW, "/login?error=rate")).rejects.toThrow(
      "REDIRECT /login?error=rate"
    );
  });

  it("licznik jest per akcja i per adres", async () => {
    // wyczerpanie limitu logowania nie może zablokować resetu hasła
    requestHeaders = new Headers({ "x-forwarded-for": "203.0.113.7" });
    for (let i = 0; i < 5; i++) await rateLimitOrRedirect("login", 5, WINDOW, "/login?error=rate");

    await expect(
      rateLimitOrRedirect("reset", 5, WINDOW, "/zapomniane-haslo?sent=1")
    ).resolves.toBeUndefined();

    requestHeaders = new Headers({ "x-forwarded-for": "9.9.9.9" });
    await expect(
      rateLimitOrRedirect("login", 5, WINDOW, "/login?error=rate")
    ).resolves.toBeUndefined();
  });
});
