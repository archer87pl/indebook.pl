import { beforeEach, describe, expect, it, vi } from "vitest";

// Webhook Channex wpuszcza do systemu rezerwacje z Booking i Airbnb. Sekret
// jest jedyną bramką, więc jego obsługa musi być fail-closed. Sam webhook to
// tylko sygnał — autorytatywną rezerwację dociągamy z API w after(), już po
// odpowiedzi, żeby Channex nie czekał i nie ponawiał.

const afterCallbacks: (() => Promise<void>)[] = [];
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (cb: () => Promise<void>) => {
    afterCallbacks.push(cb);
  },
}));

let channexProperty: { apiKey: string } | null = null;
vi.mock("@/lib/db", () => ({
  prisma: { channexProperty: { findFirst: async () => channexProperty } },
}));

let provider: { getBooking: (key: string, id: string) => Promise<unknown> } | null = null;
const fetched: { apiKey: string; bookingId: string }[] = [];
vi.mock("@/lib/channex/provider", () => ({ channelProvider: () => provider }));

const ingested: unknown[] = [];
vi.mock("@/lib/channex/ingest", () => ({
  ingestBooking: async (b: unknown) => {
    ingested.push(b);
  },
}));

const { POST } = await import("./route");

const SECRET = "sekret-webhooka-channex";
const BOOKING = { id: "bkg-1", status: "new" };

const post = (body: unknown, secret?: string) =>
  POST(
    new Request("https://rezflow.pl/api/channex/webhook", {
      method: "POST",
      headers: secret === undefined ? {} : { "x-channex-webhook-secret": secret },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );

/** Uruchamia to, co trasa odłożyła na po odpowiedzi. */
async function runAfter(): Promise<void> {
  for (const cb of afterCallbacks.splice(0)) await cb();
}

beforeEach(() => {
  afterCallbacks.length = 0;
  ingested.length = 0;
  fetched.length = 0;
  channexProperty = { apiKey: "klucz-obiektu" };
  provider = {
    getBooking: async (apiKey: string, bookingId: string) => {
      fetched.push({ apiKey, bookingId });
      return BOOKING;
    },
  };
  vi.stubEnv("CHANNEX_WEBHOOK_SECRET", SECRET);
});

describe("POST /api/channex/webhook — bramka", () => {
  it("bez nagłówka z sekretem odmawia", async () => {
    const res = await post({ event: "booking" });

    expect(res.status).toBe(401);
    expect(afterCallbacks).toEqual([]);
  });

  it("obcy sekret odmawia", async () => {
    expect((await post({ event: "booking" }, "nie-ten-sekret")).status).toBe(401);
    expect(afterCallbacks).toEqual([]);
  });

  it("prefiks poprawnego sekretu nie przechodzi", async () => {
    expect((await post({ event: "booking" }, SECRET.slice(0, -1))).status).toBe(401);
    expect((await post({ event: "booking" }, `${SECRET}x`)).status).toBe(401);
  });

  it("bez skonfigurowanego sekretu trasa jest zamknięta, a nie otwarta", async () => {
    // fail-closed: self-host bez konfiguracji nie może przyjmować rezerwacji
    // od kogokolwiek, kto zna adres webhooka
    vi.stubEnv("CHANNEX_WEBHOOK_SECRET", "");

    expect((await post({ event: "booking" })).status).toBe(401);
    expect((await post({ event: "booking" }, "")).status).toBe(401);
    expect(afterCallbacks).toEqual([]);
  });
});

describe("POST /api/channex/webhook — obsługa zdarzeń", () => {
  it("zdarzenie rezerwacji dociąga ją z API i wprowadza do systemu", async () => {
    const res = await post(
      { event: "booking", payload: { booking_id: "bkg-1", property_id: "chx-9" } },
      SECRET
    );

    // odpowiedź jest natychmiastowa — robota dzieje się po niej
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(ingested).toEqual([]);

    await runAfter();

    expect(fetched).toEqual([{ apiKey: "klucz-obiektu", bookingId: "bkg-1" }]);
    expect(ingested).toEqual([BOOKING]);
  });

  it("łapie także odmiany zdarzenia (booking_new, booking_modification)", async () => {
    for (const event of ["booking_new", "booking_modification", "booking_cancellation"]) {
      await post({ event, payload: { booking_id: "bkg-1", property_id: "chx-9" } }, SECRET);
    }

    expect(afterCallbacks).toHaveLength(3);
  });

  it("zdarzenie spoza rezerwacji nie uruchamia dociągania", async () => {
    const res = await post(
      { event: "ari_update", payload: { booking_id: "bkg-1", property_id: "chx-9" } },
      SECRET
    );

    expect(res.status).toBe(200);
    expect(afterCallbacks).toEqual([]);
  });

  it("brak identyfikatora rezerwacji nie uruchamia dociągania", async () => {
    await post({ event: "booking", payload: { property_id: "chx-9" } }, SECRET);
    expect(afterCallbacks).toEqual([]);
  });

  it("identyfikator obiektu może przyjść na wierzchu ładunku", async () => {
    // Channex bywa niekonsekwentny w umiejscowieniu property_id
    await post({ event: "booking", payload: { booking_id: "bkg-1" }, property_id: "chx-9" }, SECRET);

    await runAfter();
    expect(ingested).toEqual([BOOKING]);
  });

  it("obiekt nieznany w bazie nie wprowadza niczego", async () => {
    // webhook o cudzym obiekcie nie może wstrzyknąć nam rezerwacji
    channexProperty = null;

    await post({ event: "booking", payload: { booking_id: "bkg-1", property_id: "chx-obcy" } }, SECRET);
    await runAfter();

    expect(fetched).toEqual([]);
    expect(ingested).toEqual([]);
  });

  it("wyłączona integracja (brak providera) kończy się bez zapisu", async () => {
    provider = null;

    await post({ event: "booking", payload: { booking_id: "bkg-1", property_id: "chx-9" } }, SECRET);
    await runAfter();

    expect(ingested).toEqual([]);
  });

  it("rezerwacja nieodnaleziona w API nie trafia do systemu", async () => {
    provider = { getBooking: async () => null };

    await post({ event: "booking", payload: { booking_id: "bkg-znikl", property_id: "chx-9" } }, SECRET);
    await runAfter();

    expect(ingested).toEqual([]);
  });

  it("treść, która nie jest JSON-em, kwitujemy 200 — Channex ma nie ponawiać", async () => {
    // odpowiedź 4xx/5xx uruchomiłaby ponowienia dla żądania, które i tak
    // nigdy się nie uda; sekret już sprawdziliśmy
    const res = await post("to nie jest json", SECRET);

    expect(res.status).toBe(200);
    expect(afterCallbacks).toEqual([]);
  });
});
