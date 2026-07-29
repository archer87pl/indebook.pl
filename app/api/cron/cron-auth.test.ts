import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Trasy cronów odpalają operacje, których nikt z zewnątrz odpalać nie powinien:
// wygaszanie rezerwacji, wysyłkę przypomnień, przebudowę cen. Vercel woła je
// z nagłówkiem Authorization: Bearer <CRON_SECRET>. Bramka jest fail-closed —
// bez skonfigurowanego sekretu trasa ma być głucha, a nie otwarta.

const calls: string[] = [];

// Zadania są zaślepione: sprawdzamy bramkę, nie logikę zadań (te mają własne
// testy). Zapisujemy wywołania, żeby wykryć robotę wykonaną mimo odmowy.
vi.mock("@/lib/jobs", () => {
  const job = (name: string) => async () => {
    calls.push(name);
    return 0;
  };
  return {
    expireReservations: job("expireReservations"),
    purgeExpiredCheckIns: job("purgeExpiredCheckIns"),
    purgeExpiredSessions: job("purgeExpiredSessions"),
    purgeOldEventLogs: job("purgeOldEventLogs"),
    purgeExpiredRateLimits: job("purgeExpiredRateLimits"),
    sendArrivalReminders: job("sendArrivalReminders"),
    sendReviewRequests: job("sendReviewRequests"),
    syncAllIcalFeeds: job("syncAllIcalFeeds"),
    processAllChannexOutbox: job("processAllChannexOutbox"),
    refreshAllRates: async () => {
      calls.push("refreshAllRates");
      return { properties: 0, days: 0 };
    },
  };
});

const ROUTES = [
  { name: "expire-reservations", load: () => import("./expire-reservations/route") },
  { name: "sync-ical", load: () => import("./sync-ical/route") },
  { name: "rates", load: () => import("./rates/route") },
];

const SECRET = "sekret-crona-z-vercela";
const req = (authorization?: string) =>
  new Request("https://rezflow.pl/api/cron/x", {
    headers: authorization ? { authorization } : {},
  });

beforeEach(() => {
  calls.length = 0;
  vi.stubEnv("CRON_SECRET", SECRET);
});

afterEach(() => vi.unstubAllEnvs());

describe.each(ROUTES)("GET /api/cron/$name", ({ load }) => {
  it("z poprawnym sekretem wykonuje zadanie", async () => {
    const { GET } = await load();

    const res = await GET(req(`Bearer ${SECRET}`));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(calls.length).toBeGreaterThan(0);
  });

  it("bez nagłówka odmawia i niczego nie uruchamia", async () => {
    const { GET } = await load();

    const res = await GET(req());

    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("obcy sekret odmawia", async () => {
    const { GET } = await load();

    expect((await GET(req("Bearer nie-ten-sekret"))).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("sam token bez schematu Bearer nie wystarcza", async () => {
    const { GET } = await load();

    expect((await GET(req(SECRET))).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("prefiks poprawnego sekretu nie przechodzi", async () => {
    // porównanie jest całościowe i stałoczasowe — próba zgadywania po znaku
    // nie może przejść na krótszym ciągu
    const { GET } = await load();

    expect((await GET(req(`Bearer ${SECRET.slice(0, -1)}`))).status).toBe(401);
    expect((await GET(req(`Bearer ${SECRET}x`))).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("pusty CRON_SECRET zamyka trasę", async () => {
    // fail-closed: brak konfiguracji nie może oznaczać otwartego endpointu,
    // bo self-host bez sekretu wystawiłby wygaszanie rezerwacji publicznie
    vi.stubEnv("CRON_SECRET", "");
    const { GET } = await load();

    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer "))).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("całkiem nieustawiony CRON_SECRET nie daje się obejść przez „Bearer undefined”", async () => {
    // Gdyby zniknęło sprawdzenie `!secret`, oczekiwaną wartością stałby się
    // wynik interpolacji `Bearer ${undefined}` — czyli hasło znane każdemu.
    vi.stubEnv("CRON_SECRET", undefined);
    const { GET } = await load();

    expect((await GET(req("Bearer undefined"))).status).toBe(401);
    expect((await GET(req("Bearer null"))).status).toBe(401);
    expect((await GET(req())).status).toBe(401);
    expect(calls).toEqual([]);
  });
});
