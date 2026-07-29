import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingData } from "./provider";

// Wprowadzanie rezerwacji z OTA (Booking, Airbnb) do systemu. Dane przychodzą
// z zewnątrz i od razu zamykają termin, więc każda pomyłka jest kosztowna:
// przypisanie do zajętej jednostki to dwóch gości w jednym pokoju, zgubione
// anulowanie to pokój stojący pusty, a brak idempotencji — duplikat rezerwacji
// przy każdym ponowieniu webhooka.
// (pickFreeUnit ma osobny plik testów — tu chodzi o całą ścieżkę zapisu.)

let channexProperty: { propertyId: number } | null = null;
let channexRoom: { unitTypeId: number } | null = null;
let existing: { id: number; code: string; status: string; checkIn: string; checkOut: string } | null =
  null;
let units: { id: number }[] = [];
let overlapping: { unitId: number; checkIn: string; checkOut: string }[] = [];

const creates: Record<string, unknown>[] = [];
const updates: { id: number; data: Record<string, unknown> }[] = [];
const overlapQueries: Record<string, unknown>[] = [];
const events: { level?: string; message: string; propertyId?: number | null }[] = [];
const ariCalls: { propertyId: number; unitTypeId: number; from: string; to: string }[] = [];

vi.mock("../db", () => ({
  prisma: {
    channexProperty: { findFirst: async () => channexProperty },
    channexRoom: { findFirst: async () => channexRoom },
    reservation: {
      findUnique: async () => existing,
      findMany: async (args: Record<string, unknown>) => {
        overlapQueries.push(args.where as Record<string, unknown>);
        return overlapping;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        creates.push(data);
      },
      update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
        updates.push({ id: where.id, data });
      },
    },
    unit: { findMany: async () => units },
  },
}));

vi.mock("../log", () => ({
  logEvent: async (e: (typeof events)[number]) => {
    events.push(e);
  },
}));

vi.mock("./enqueue-helpers", () => ({
  afterAri: async (propertyId: number, unitTypeId: number, from: string, to: string) => {
    ariCalls.push({ propertyId, unitTypeId, from, to });
  },
}));

const { ingestBooking } = await import("./ingest");

function booking(over: Partial<BookingData> = {}): BookingData {
  return {
    channexBookingId: "bkg-1",
    channexPropertyId: "chx-9",
    channexRoomTypeId: "room-2",
    channel: "BOOKING",
    status: "new",
    arrival: "2026-08-10",
    departure: "2026-08-14",
    guests: 2,
    guestName: "Anna Kowalska",
    email: "anna@example.com",
    phone: "+48600100200",
    totalGr: 120000,
    commissionGr: 18000,
    ...over,
  } as BookingData;
}

beforeEach(() => {
  channexProperty = { propertyId: 3 };
  channexRoom = { unitTypeId: 7 };
  existing = null;
  units = [{ id: 101 }, { id: 102 }];
  overlapping = [];
  creates.length = 0;
  updates.length = 0;
  overlapQueries.length = 0;
  events.length = 0;
  ariCalls.length = 0;
});

describe("ingestBooking — nowa rezerwacja", () => {
  it("zapisuje rezerwację od razu potwierdzoną, bez zaliczki i bez terminu wygaśnięcia", async () => {
    // OTA pobiera płatność u siebie — u nas rezerwacja jest opłacona z definicji
    await ingestBooking(booking());

    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({
      unitId: 101,
      checkIn: "2026-08-10",
      checkOut: "2026-08-14",
      status: "CONFIRMED",
      depositGr: 0,
      expiresAt: null,
      source: "BOOKING",
      channexBookingId: "bkg-1",
      otaCommissionGr: 18000,
    });
  });

  it("nadaje kod rezerwacji w formacie systemowym", async () => {
    await ingestBooking(booking());

    expect(String(creates[0].code)).toMatch(/^HO-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
  });

  it("kody nie powtarzają się między rezerwacjami", async () => {
    await ingestBooking(booking({ channexBookingId: "bkg-1" }));
    await ingestBooking(booking({ channexBookingId: "bkg-2" }));

    expect(creates[0].code).not.toBe(creates[1].code);
  });

  it("wybiera pierwszą wolną jednostkę, omijając zajętą", async () => {
    overlapping = [{ unitId: 101, checkIn: "2026-08-12", checkOut: "2026-08-16" }];

    await ingestBooking(booking());

    expect(creates[0].unitId).toBe(102);
  });

  it("odświeża dostępność w kanałach dla zapisanego terminu", async () => {
    // bez tego OTA nadal widziałaby pokój jako wolny i sprzedała go drugi raz
    await ingestBooking(booking());

    expect(ariCalls).toEqual([
      { propertyId: 3, unitTypeId: 7, from: "2026-08-10", to: "2026-08-14" },
    ]);
  });

  it("zostawia wpis w dzienniku z kanałem sprzedaży", async () => {
    await ingestBooking(booking());

    expect(events[0]).toMatchObject({ level: "INFO", propertyId: 3 });
    expect(events[0].message).toContain("BOOKING");
  });
});

describe("ingestBooking — oversell", () => {
  it("gdy nie ma wolnej jednostki, rezerwacja i tak wchodzi, ale z alarmem", async () => {
    // gość zapłacił w OTA — odrzucenie zostawiłoby go bez pokoju i bez wiedzy
    // o tym; recepcja musi zobaczyć konflikt i zareagować
    overlapping = [
      { unitId: 101, checkIn: "2026-08-09", checkOut: "2026-08-15" },
      { unitId: 102, checkIn: "2026-08-09", checkOut: "2026-08-15" },
    ];

    await ingestBooking(booking());

    expect(creates).toHaveLength(1);
    expect(creates[0].unitId).toBe(101); // ląduje na pierwszej, do ręcznego rozwiązania
    expect(events[0]).toMatchObject({ level: "ERROR" });
    expect(events[0].message).toContain("KONFLIKT");
  });

  it("typ pokoju bez aktywnych jednostek nie tworzy rezerwacji-sieroty", async () => {
    units = [];

    await ingestBooking(booking());

    expect(creates).toEqual([]);
    expect(events[0]).toMatchObject({ level: "ERROR" });
    expect(events[0].message).toContain("bez aktywnych jednostek");
  });
});

describe("ingestBooking — ponowienia i zmiany", () => {
  it("ten sam webhook drugi raz aktualizuje rezerwację zamiast tworzyć duplikat", async () => {
    // Channex ponawia powiadomienia; klucz channexBookingId jest gwarancją,
    // że gość nie dostanie dwóch pokoi za jedną rezerwację
    existing = {
      id: 55,
      code: "HO-ISTNIEJE",
      status: "CONFIRMED",
      checkIn: "2026-08-10",
      checkOut: "2026-08-14",
    };

    await ingestBooking(booking());

    expect(creates).toEqual([]);
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe(55);
  });

  it("zmiana terminu w OTA nie liczy starej rezerwacji jako kolizji", async () => {
    // inaczej przedłużenie pobytu przez gościa wyglądałoby na oversell
    existing = {
      id: 55,
      code: "HO-ISTNIEJE",
      status: "CONFIRMED",
      checkIn: "2026-08-10",
      checkOut: "2026-08-12",
    };

    await ingestBooking(booking({ departure: "2026-08-16" }));

    expect(overlapQueries[0]).toMatchObject({ id: { not: 55 } });
    expect(updates[0].data).toMatchObject({ checkOut: "2026-08-16" });
  });

  it("kolizje liczy tylko wśród rezerwacji, które faktycznie zajmują termin", async () => {
    await ingestBooking(booking());

    expect(overlapQueries[0]).toMatchObject({
      status: { in: ["CONFIRMED", "PENDING"] },
      checkIn: { lt: "2026-08-14" },
      checkOut: { gt: "2026-08-10" },
    });
  });
});

describe("ingestBooking — anulowanie", () => {
  it("anuluje rezerwację i oddaje termin do sprzedaży", async () => {
    existing = {
      id: 55,
      code: "HO-ISTNIEJE",
      status: "CONFIRMED",
      checkIn: "2026-08-10",
      checkOut: "2026-08-14",
    };

    await ingestBooking(booking({ status: "cancelled" }));

    expect(updates[0]).toMatchObject({ id: 55, data: { status: "CANCELLED" } });
    // ARI odświeżamy dla STAREGO terminu — to on wraca do puli
    expect(ariCalls).toEqual([
      { propertyId: 3, unitTypeId: 7, from: "2026-08-10", to: "2026-08-14" },
    ]);
    expect(events[0].message).toContain("HO-ISTNIEJE");
  });

  it("powtórzone anulowanie nie robi nic drugi raz", async () => {
    existing = {
      id: 55,
      code: "HO-ISTNIEJE",
      status: "CANCELLED",
      checkIn: "2026-08-10",
      checkOut: "2026-08-14",
    };

    await ingestBooking(booking({ status: "cancelled" }));

    expect(updates).toEqual([]);
    expect(ariCalls).toEqual([]);
    expect(events).toEqual([]);
  });

  it("anulowanie rezerwacji, której nigdy nie mieliśmy, nie tworzy jej", async () => {
    existing = null;

    await ingestBooking(booking({ status: "cancelled" }));

    expect(creates).toEqual([]);
    expect(updates).toEqual([]);
  });
});

describe("ingestBooking — brak mapowania", () => {
  it("nieznany obiekt nie wpuszcza rezerwacji do systemu", async () => {
    channexProperty = null;

    await ingestBooking(booking());

    expect(creates).toEqual([]);
    expect(events[0]).toMatchObject({ level: "ERROR" });
    expect(events[0].message).toContain("bez mapowania");
  });

  it("niezmapowany typ pokoju też jest odrzucany, ale wpis wskazuje obiekt", async () => {
    // dzięki temu superadmin widzi w dzienniku, czyja konfiguracja jest niepełna
    channexRoom = null;

    await ingestBooking(booking());

    expect(creates).toEqual([]);
    expect(events[0]).toMatchObject({ level: "ERROR", propertyId: 3 });
  });
});
