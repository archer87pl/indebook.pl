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

// clientIp() sięga po nagłówki Next; tutaj testujemy samo liczenie
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { rateLimit } = await import("./rate-limit");

beforeEach(() => {
  rows.clear();
  failDb = false;
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
