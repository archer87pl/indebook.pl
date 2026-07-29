import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKIN_RETENTION_DAYS } from "./checkin";

// Zadania okresowe kasują dane i zmieniają statusy bez udziału człowieka —
// za szeroki warunek `where` kasuje coś, czego nikt nie miał zamiaru stracić.
// Testy patrzą właśnie na te warunki: co dokładnie job wybiera do usunięcia.

type Where = Record<string, unknown>;
const queries: { model: string; where: Where; data?: Where }[] = [];
let counts: Record<string, number> = {};
let activeChannex: { propertyId: number }[] = [];
const outboxCalls: number[] = [];

function recorder(model: string) {
  return async ({ where, data }: { where: Where; data?: Where }) => {
    queries.push({ model, where, data });
    return { count: counts[model] ?? 0 };
  };
}

vi.mock("./db", () => ({
  prisma: {
    reservation: { updateMany: recorder("reservation") },
    checkInCard: { deleteMany: recorder("checkInCard") },
    session: { deleteMany: recorder("session") },
    passwordResetToken: { deleteMany: recorder("passwordResetToken") },
    rateLimit: { deleteMany: recorder("rateLimit") },
    eventLog: { deleteMany: recorder("eventLog") },
    channexProperty: { findMany: async () => activeChannex },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

// zależności zadań, których tu nie testujemy — mają własne pliki testowe
vi.mock("./mailer", () => ({ sendMail: async () => {} }));
vi.mock("./sms", () => ({ sendSms: async () => {} }));
vi.mock("./ical", () => ({ syncIcalFeed: async () => ({ ok: true, imported: 0 }) }));
vi.mock("./guest-mail", () => ({ guestT: async () => (k: string) => k }));
vi.mock("./rates/refresh", () => ({ refreshRates: async () => 0 }));
vi.mock("./channex/outbox", () => ({
  processOutbox: async (propertyId: number) => {
    outboxCalls.push(propertyId);
    return { sent: 2 };
  },
}));

const {
  expireReservations,
  processAllChannexOutbox,
  purgeExpiredCheckIns,
  purgeExpiredRateLimits,
  purgeExpiredSessions,
  purgeOldEventLogs,
} = await import("./jobs");

const NOW = new Date("2026-07-29T12:00:00Z");

beforeEach(() => {
  queries.length = 0;
  outboxCalls.length = 0;
  counts = {};
  activeChannex = [];
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const last = (model: string) => queries.filter((q) => q.model === model).at(-1)!;

describe("expireReservations", () => {
  it("anuluje wyłącznie wstępne rezerwacje po terminie zaliczki", () => {
    // gdyby warunek objął CONFIRMED, job kasowałby opłacone pobyty
    expireReservations();

    expect(last("reservation").where).toEqual({
      status: "PENDING",
      expiresAt: { lt: NOW },
    });
    expect(last("reservation").data).toEqual({ status: "CANCELLED" });
  });

  it("oddaje liczbę wygaszonych rezerwacji", async () => {
    counts.reservation = 3;
    expect(await expireReservations()).toBe(3);
  });
});

describe("purgeExpiredCheckIns", () => {
  it("kasuje karty meldunkowe dopiero po okresie retencji", async () => {
    // karta zawiera dane z dokumentu tożsamości — trzymamy ją najkrócej,
    // jak pozwalają przepisy, ale ani dnia krócej niż deklarujemy
    await purgeExpiredCheckIns();

    expect(CHECKIN_RETENTION_DAYS).toBe(365);
    expect(last("checkInCard").where).toEqual({
      reservation: { checkOut: { lt: "2025-07-29" } },
    });
  });

  it("liczy po dacie WYJAZDU, nie po dacie utworzenia karty", async () => {
    await purgeExpiredCheckIns();
    expect(JSON.stringify(last("checkInCard").where)).toContain("checkOut");
  });
});

describe("purgeExpiredSessions", () => {
  it("kasuje wygasłe sesje i tokeny resetu w jednej transakcji", async () => {
    counts.session = 5;

    const removed = await purgeExpiredSessions();

    expect(removed).toBe(5);
    expect(last("session").where).toEqual({ expiresAt: { lt: NOW } });
    expect(last("passwordResetToken").where).toEqual({ expiresAt: { lt: NOW } });
  });

  it("nie rusza sesji jeszcze ważnych", async () => {
    await purgeExpiredSessions();
    // próg to „mniejsze niż teraz” — sesja wygasająca za sekundę zostaje
    expect((last("session").where as { expiresAt: { lt: Date } }).expiresAt.lt).toEqual(NOW);
  });
});

describe("purgeExpiredRateLimits", () => {
  it("kasuje tylko zamknięte okna licznika", async () => {
    await purgeExpiredRateLimits();
    expect(last("rateLimit").where).toEqual({ resetAt: { lt: NOW } });
  });
});

describe("purgeOldEventLogs", () => {
  it("trzyma dziennik przez 90 dni", async () => {
    await purgeOldEventLogs();

    const cutoff = (last("eventLog").where as { createdAt: { lt: Date } }).createdAt.lt;
    const days = (NOW.getTime() - cutoff.getTime()) / 86_400_000;
    expect(days).toBe(90);
  });
});

describe("processAllChannexOutbox", () => {
  it("przetwarza kolejkę tylko aktywnych połączeń i sumuje wysyłki", async () => {
    activeChannex = [{ propertyId: 4 }, { propertyId: 9 }];

    expect(await processAllChannexOutbox()).toBe(4); // 2 obiekty × 2 wysyłki
    expect(outboxCalls).toEqual([4, 9]);
  });

  it("brak aktywnych połączeń to zero roboty, a nie błąd", async () => {
    expect(await processAllChannexOutbox()).toBe(0);
    expect(outboxCalls).toEqual([]);
  });
});
