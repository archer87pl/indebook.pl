import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChannexClient } from "./client";
import type { AriDay } from "./provider";

// Klient HTTP Channex — jedyne miejsce, w którym rozmawiamy z kanałami.
// Ponawianie musi się kończyć, błąd musi nieść treść z odpowiedzi (właściciel
// zobaczy ją w panelu), a klucz API nigdy nie może wyjść w URL-u.
// (availabilityValues i restrictionValues mają osobny plik testów.)

const BASE = "https://staging.channex.io/api/v1";
const KEY = "klucz-api-obiektu";

const days: AriDay[] = [
  { date: "2026-08-10", availability: 2, minStay: 1, rateGr: 25000 },
  { date: "2026-08-11", availability: 0, minStay: 2, rateGr: 27500 },
];

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];

/** Odpowiada kolejno podanymi wynikami; ostatni powtarza się do końca. */
function respond(...responses: (Response | Error | (() => Response))[]) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (r instanceof Error) throw r;
    return typeof r === "function" ? r() : r;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const ok = (body: unknown = { data: { id: "id-1" } }) =>
  () => new Response(JSON.stringify(body), { status: 200 });

const client = () => new ChannexClient(KEY, BASE);
const bodyOf = (call: Call) => JSON.parse(call.init.body as string);

beforeEach(() => {
  calls = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("uwierzytelnianie i transport", () => {
  it("klucz API idzie w nagłówku, nigdy w adresie", async () => {
    // klucz w URL-u wyciekłby do logów serwera, proxy i historii przeglądarki
    respond(ok());

    await client().pushAri(KEY, "chx-9", "room-2", "", days);

    expect(calls[0].url).toBe(`${BASE}/availability`);
    expect(calls[0].url).not.toContain(KEY);
    expect((calls[0].init.headers as Record<string, string>)["user-api-key"]).toBe(KEY);
  });

  it("każde żądanie ma limit czasu", async () => {
    // bez tego cron mógłby wisieć na jednym zawieszonym połączeniu
    respond(ok());

    await client().pushAri(KEY, "chx-9", "room-2", "", days);

    expect(calls[0].init.signal).toBeDefined();
  });
});

describe("ponawianie", () => {
  it("błąd serwera jest ponawiany i udaje się przy drugiej próbie", async () => {
    respond(new Response("", { status: 503 }), ok());

    await client().pushAri(KEY, "chx-9", "room-2", "", days);

    expect(calls).toHaveLength(2);
  });

  it("po trzech nieudanych próbach oddaje błąd, a nie wisi", async () => {
    respond(new Response("", { status: 500 }));

    await expect(client().pushAri(KEY, "chx-9", "room-2", "", days)).rejects.toThrow(
      /Channex HTTP 500/
    );
    expect(calls).toHaveLength(3);
  });

  it("zerwane połączenie też jest ponawiane", async () => {
    respond(new Error("ECONNRESET"), new Error("ECONNRESET"), ok());

    await client().pushAri(KEY, "chx-9", "room-2", "", days);

    expect(calls).toHaveLength(3);
  });

  it("odrzucenie z winy żądania (4xx) NIE jest ponawiane", async () => {
    // ponawianie błędu walidacji tylko potroiłoby ruch — odpowiedź się nie zmieni
    respond(
      () =>
        new Response(JSON.stringify({ errors: { rate: ["is invalid"] } }), { status: 422 })
    );

    await expect(client().pushAri(KEY, "chx-9", "room-2", "", days)).rejects.toThrow(
      /is invalid/
    );
    expect(calls).toHaveLength(1);
  });

  it("brak uprawnień też jest ostateczny", async () => {
    respond(() => new Response(JSON.stringify({ errors: "unauthorized" }), { status: 401 }));

    await expect(client().pushAri(KEY, "chx-9", "room-2", "", days)).rejects.toThrow(/Channex/);
    expect(calls).toHaveLength(1);
  });

  it("przekroczony limit zapytań jest ponawiany — to stan przejściowy", async () => {
    respond(new Response("", { status: 429 }), ok());

    await client().pushAri(KEY, "chx-9", "room-2", "", days);

    expect(calls).toHaveLength(2);
  });

  it("treść błędu z odpowiedzi trafia do komunikatu — właściciel zobaczy ją w panelu", async () => {
    respond(
      () =>
        new Response(JSON.stringify({ errors: { room_type_id: ["nie istnieje"] } }), {
          status: 422,
        })
    );

    await expect(client().pushAri(KEY, "chx-9", "room-2", "", days)).rejects.toThrow(
      /nie istnieje/
    );
  });

  it("odpowiedź bez poprawnego JSON-a nie wywraca klienta", async () => {
    respond(() => new Response("nie-json", { status: 200 }));

    await expect(client().pushAri(KEY, "chx-9", "room-2", "", days)).resolves.toBeUndefined();
  });
});

describe("pushAri", () => {
  it("wysyła dostępność, a stawki tylko gdy jest plan cenowy", async () => {
    respond(ok());

    await client().pushAri(KEY, "chx-9", "room-2", "plan-1", days);

    expect(calls.map((c) => c.url)).toEqual([`${BASE}/availability`, `${BASE}/restrictions`]);
    expect(bodyOf(calls[0]).values[0]).toMatchObject({
      property_id: "chx-9",
      room_type_id: "room-2",
      date: "2026-08-10",
      availability: 2,
    });
    expect(bodyOf(calls[1]).values[0]).toMatchObject({
      rate_plan_id: "plan-1",
      min_stay_arrival: 1,
      rate: "250.00", // grosze → waluta obiektu
    });
  });

  it("bez planu cenowego wysyła samą dostępność", async () => {
    // obiekt w trakcie konfiguracji ma pokój, ale nie ma jeszcze planu —
    // dostępność ma iść i tak, żeby kanał nie sprzedawał zajętych terminów
    respond(ok());

    await client().pushAri(KEY, "chx-9", "room-2", "", days);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/availability`);
  });
});

describe("provisionProperty", () => {
  it("zakłada obiekt, a potem pokój i plan cenowy dla każdego typu", async () => {
    let n = 0;
    respond(() => new Response(JSON.stringify({ data: { id: `id-${++n}` } }), { status: 200 }));

    const result = await client().provisionProperty({
      name: "Willa Pod Dębem",
      currency: "PLN",
      timezone: "Europe/Warsaw",
      checkInFrom: "15:00",
      checkOutTo: "11:00",
      address: "Zakopane",
      rooms: [{ unitTypeId: 7, title: "Dwuosobowy", count: 3, occupancy: 2 }],
    });

    expect(calls.map((c) => c.url)).toEqual([
      `${BASE}/properties`,
      `${BASE}/room_types`,
      `${BASE}/rate_plans`,
    ]);
    expect(result).toEqual({
      channexPropertyId: "id-1",
      apiKey: KEY,
      rooms: [{ unitTypeId: 7, roomTypeId: "id-2", ratePlanId: "id-3" }],
    });
  });

  it("pokój i plan wiążą się z założonym obiektem, a nie z niczym", async () => {
    let n = 0;
    respond(() => new Response(JSON.stringify({ data: { id: `id-${++n}` } }), { status: 200 }));

    await client().provisionProperty({
      name: "Willa",
      currency: "PLN",
      timezone: "Europe/Warsaw",
      checkInFrom: "15:00",
      checkOutTo: "11:00",
      address: "",
      rooms: [{ unitTypeId: 7, title: "Dwuosobowy", count: 3, occupancy: 2 }],
    });

    expect(bodyOf(calls[1]).room_type).toMatchObject({
      property_id: "id-1",
      count_of_rooms: 3,
      occ_adults: 2,
    });
    expect(bodyOf(calls[2]).rate_plan).toMatchObject({
      property_id: "id-1",
      room_type_id: "id-2",
      currency: "PLN",
    });
  });

  it("włącza automatyczne zamykanie dostępności po potwierdzeniu rezerwacji", async () => {
    // bez tego ustawienia kanał sprzedałby ten sam pokój drugi raz,
    // zanim dotrze nasz push
    respond(ok());

    await client().provisionProperty({
      name: "Willa",
      currency: "PLN",
      timezone: "Europe/Warsaw",
      checkInFrom: "15:00",
      checkOutTo: "11:00",
      address: "",
      rooms: [],
    });

    expect(bodyOf(calls[0]).property.settings).toMatchObject({
      allow_availability_autoupdate_on_confirmation: true,
    });
  });
});

describe("registerWebhook", () => {
  it("rejestruje adres zwrotny z sekretem w nagłówku", async () => {
    respond(ok());

    await client().registerWebhook("chx-9", "https://rezflow.pl/api/channex/webhook", "sekret");

    expect(calls[0].url).toBe(`${BASE}/webhooks`);
    expect(bodyOf(calls[0]).webhook).toMatchObject({
      property_id: "chx-9",
      callback_url: "https://rezflow.pl/api/channex/webhook",
      event_mask: "booking",
      is_active: true,
      headers: { "X-Channex-Webhook-Secret": "sekret" },
    });
  });
});

describe("getBooking", () => {
  it("mapuje rezerwację z odpowiedzi na nasz kształt", async () => {
    respond(
      () =>
        new Response(
          JSON.stringify({
            data: {
              id: "bkg-1",
              attributes: {
                id: "bkg-1",
                property_id: "chx-9",
                ota_name: "Booking.com",
                status: "new",
                arrival_date: "2026-08-10",
                departure_date: "2026-08-14",
                customer: { name: "Anna", surname: "Kowalska", mail: "anna@example.com" },
                rooms: [{ room_type_id: "room-2", occupancy: { adults: 2 } }],
                amount: "1200.00",
              },
            },
          }),
          { status: 200 }
        )
    );

    const booking = await client().getBooking(KEY, "bkg-1");

    expect(calls[0].url).toBe(`${BASE}/bookings/bkg-1`);
    expect(booking).toMatchObject({ channexBookingId: "bkg-1", arrival: "2026-08-10" });
  });

  it("odpowiedź bez danych rezerwacji daje null, a nie pusty obiekt", async () => {
    // null przechodzi przez webhook jako „nie ma czego wprowadzać";
    // obiekt z pustymi polami utworzyłby rezerwację-śmieć
    respond(() => new Response(JSON.stringify({ data: { id: "bkg-1" } }), { status: 200 }));

    expect(await client().getBooking(KEY, "bkg-1")).toBeNull();
  });
});

describe("metody jeszcze niepotwierdzone na sandboxie", () => {
  it("podłączanie kanałów mówi wprost, że schema wymaga potwierdzenia", async () => {
    // lepszy jawny błąd niż zgadnięty payload, który cicho nic nie podłączy
    const c = client();

    await expect(c.connectBooking()).rejects.toThrow(/Plan D/);
    await expect(c.startAirbnbOAuth()).rejects.toThrow(/Plan D/);
    await expect(c.finishAirbnbOAuth()).rejects.toThrow(/Plan D/);
    await expect(c.channelStatus()).rejects.toThrow(/Plan D/);
  });
});
