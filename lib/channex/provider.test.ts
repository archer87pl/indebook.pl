import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChannexClient } from "./client";
import { channelProvider, stubProvider } from "./provider";

describe("stubProvider", () => {
  beforeEach(() => {
    stubProvider.calls.length = 0;
  });
  it("pushAri zapisuje wywołanie i nie rzuca", async () => {
    await stubProvider.pushAri("k", "stub-prop", "rt", "rp", [
      { date: "2026-08-01", availability: 2, minStay: 1, rateGr: 30000 },
    ]);
    expect(stubProvider.calls).toHaveLength(1);
    expect(stubProvider.calls[0]).toMatchObject({
      roomTypeId: "rt",
      days: [{ date: "2026-08-01", availability: 2 }],
    });
  });
  it("provisionProperty mapuje pokoje na deterministyczne id", async () => {
    const res = await stubProvider.provisionProperty({
      name: "W", address: "", currency: "PLN", timezone: "Europe/Warsaw",
      checkInFrom: "15:00", checkOutTo: "11:00",
      rooms: [{ unitTypeId: 7, title: "Apartament", occupancy: 4, count: 2 }],
    });
    expect(res.rooms[0]).toEqual({ unitTypeId: 7, roomTypeId: "stub-rt-7", ratePlanId: "stub-rp-7" });
  });
});

// Wybór providera decyduje, czy zmiany dostępności lecą do prawdziwych kanałów,
// czy do atrapy. Pomyłka w jedną stronę to cisza w Booking i Airbnb, w drugą —
// testy i dev strzelające do produkcyjnego API kanału sprzedaży.
describe("channelProvider", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("bez klucza API nie ma providera — tryb Channex jest wtedy ukryty w panelu", () => {
    vi.stubEnv("CHANNEX_STUB", "");
    vi.stubEnv("CHANNEX_API_KEY", "");

    expect(channelProvider()).toBeNull();
  });

  it("z kluczem API buduje realnego klienta", () => {
    vi.stubEnv("CHANNEX_STUB", "");
    vi.stubEnv("CHANNEX_API_KEY", "klucz-produkcyjny");

    expect(channelProvider()).toBeInstanceOf(ChannexClient);
  });

  it("CHANNEX_STUB=1 wygrywa nawet wtedy, gdy klucz produkcyjny jest ustawiony", () => {
    // to jest zabezpieczenie testów i dev-serwera: obecność klucza w .env
    // nie może wysłać zmian do prawdziwych kanałów
    vi.stubEnv("CHANNEX_STUB", "1");
    vi.stubEnv("CHANNEX_API_KEY", "klucz-produkcyjny");

    expect(channelProvider()).toBe(stubProvider);
  });

  it("inna wartość niż „1” nie włącza atrapy", () => {
    // półśrodki („true", „yes") nie mogą przypadkiem wyciszyć synchronizacji
    vi.stubEnv("CHANNEX_API_KEY", "klucz-produkcyjny");

    for (const value of ["true", "yes", "0", "stub"]) {
      vi.stubEnv("CHANNEX_STUB", value);
      expect(channelProvider(), `CHANNEX_STUB=${value}`).toBeInstanceOf(ChannexClient);
    }
  });
});

describe("stubProvider — pozostałe metody", () => {
  it("nie pobiera rezerwacji: webhook w dev nie ma skąd ich brać", async () => {
    expect(await stubProvider.getBooking("k", "bkg-1")).toBeNull();
  });

  it("rejestracja webhooka jest pustą operacją, nie błędem", async () => {
    await expect(
      stubProvider.registerWebhook("stub-prop", "http://localhost:3100/api/channex/webhook", "s")
    ).resolves.toBeUndefined();
  });

  it("podłączanie kanałów udaje sukces, żeby dało się przejść ścieżkę w panelu", async () => {
    expect(await stubProvider.connectBooking("stub-prop", "hotel-1", [])).toMatchObject({
      status: "connected",
    });
    expect(await stubProvider.finishAirbnbOAuth("stub-prop", "kod")).toMatchObject({
      status: "connected",
    });
    expect(await stubProvider.channelStatus("stub-airbnb")).toMatchObject({
      status: "connected",
    });
  });

  it("adres autoryzacji Airbnb ma podmienialny znacznik state", async () => {
    // trasa startowa podstawia w to miejsce realny podpisany state
    const { authUrl } = await stubProvider.startAirbnbOAuth("stub-prop", "http://localhost/cb");

    expect(authUrl).toContain("STATE");
    expect(authUrl).toContain("/api/channex/airbnb/callback");
  });
});
