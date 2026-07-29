import { beforeEach, describe, expect, it, vi } from "vitest";

// Worker kolejki ARI: wysyła do Channex dostępność, minStay i stawki, czyli
// to, po czym Booking i Airbnb sprzedają nasze pokoje. Trzy rzeczy są tu
// krytyczne: zadanie oznaczone SENT zniknie z kolejki na zawsze (więc nie
// wolno go odznaczyć, gdy push się nie udał), nieudane próby muszą się
// kończyć (limit prób), a scalanie zakresów nie może zgubić żadnego zadania.
// (coalesceRanges ma osobny plik testów — tu chodzi o całą pętlę.)

type Row = { id: number; unitTypeId: number; dateFrom: string; dateTo: string };

let channexProperty: { propertyId: number; status: string; apiKey: string; channexId: string } | null =
  null;
let rows: Row[] = [];
let room: { channexRoomTypeId: string | null; channexRatePlanId: string } | null = null;
let unitType: { id: number; minStay: number; basePriceGr: number; seasons: unknown[] } | null = null;
let pushError: Error | null = null;

const outboxQueries: Record<string, unknown>[] = [];
const outboxUpdates: { ids: number[]; data: Record<string, unknown> }[] = [];
const pushes: { apiKey: string; channexId: string; roomTypeId: string; days: unknown[] }[] = [];
const events: { level?: string; message: string; meta?: string }[] = [];

vi.mock("../db", () => ({
  prisma: {
    channexProperty: { findUnique: async () => channexProperty },
    ariOutbox: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        outboxQueries.push(where);
        return rows;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: { in: number[] } };
        data: Record<string, unknown>;
      }) => {
        outboxUpdates.push({ ids: where.id.in, data });
        return { count: where.id.in.length };
      },
      create: async () => {},
    },
    channexRoom: { findUnique: async () => room },
    unitType: { findUnique: async () => unitType },
  },
}));

vi.mock("../log", () => ({
  logEvent: async (e: (typeof events)[number]) => {
    events.push(e);
  },
}));

vi.mock("./availability", () => ({
  roomTypeAvailability: async () => new Map([["2026-08-10", 2]]),
}));
vi.mock("../dynamic-pricing", () => ({
  nightlyRates: async () => new Map([["2026-08-10", 25000]]),
}));
vi.mock("./ari", () => ({
  buildAriDays: () => [{ date: "2026-08-10", availability: 2, minStay: 1, rateGr: 25000 }],
}));

const { processOutbox } = await import("./outbox");

const provider = {
  pushAri: async (
    apiKey: string,
    channexId: string,
    roomTypeId: string,
    _ratePlanId: string,
    days: unknown[]
  ) => {
    if (pushError) throw pushError;
    pushes.push({ apiKey, channexId, roomTypeId, days });
  },
} as unknown as Parameters<typeof processOutbox>[1];

beforeEach(() => {
  channexProperty = {
    propertyId: 3,
    status: "ACTIVE",
    apiKey: "klucz-obiektu",
    channexId: "chx-9",
  };
  rows = [{ id: 1, unitTypeId: 7, dateFrom: "2026-08-10", dateTo: "2026-08-12" }];
  room = { channexRoomTypeId: "room-2", channexRatePlanId: "plan-1" };
  unitType = { id: 7, minStay: 1, basePriceGr: 20000, seasons: [] };
  pushError = null;
  outboxQueries.length = 0;
  outboxUpdates.length = 0;
  pushes.length = 0;
  events.length = 0;
});

describe("processOutbox — bramki", () => {
  it("bez skonfigurowanego providera nie robi nic", async () => {
    expect(await processOutbox(3, null)).toEqual({ sent: 0, failed: 0 });
    expect(pushes).toEqual([]);
  });

  it("obiekt bez połączenia Channex nie wysyła", async () => {
    channexProperty = null;
    expect(await processOutbox(3, provider)).toEqual({ sent: 0, failed: 0 });
  });

  it("połączenie niegotowe (nie ACTIVE) nie wysyła", async () => {
    // w trakcie konfiguracji push poszedłby w próżnię i spalił próby
    channexProperty!.status = "PENDING";
    expect(await processOutbox(3, provider)).toEqual({ sent: 0, failed: 0 });
    expect(outboxQueries).toEqual([]);
  });

  it("pusta kolejka to brak roboty", async () => {
    rows = [];
    expect(await processOutbox(3, provider)).toEqual({ sent: 0, failed: 0 });
    expect(pushes).toEqual([]);
  });
});

describe("processOutbox — wybór zadań", () => {
  it("bierze zadania oczekujące i nieudane, ale tylko poniżej limitu prób", async () => {
    // bez limitu jedno trwale zepsute zadanie (np. usunięty pokój w Channex)
    // byłoby ponawiane w każdym biegu crona do końca świata
    await processOutbox(3, provider);

    expect(outboxQueries[0]).toEqual({
      propertyId: 3,
      status: { in: ["PENDING", "ERROR"] },
      attempts: { lt: 5 },
    });
  });
});

describe("processOutbox — udany push", () => {
  it("wysyła stawki i dostępność kluczem obiektu, po czym zamyka zadania", async () => {
    expect(await processOutbox(3, provider)).toEqual({ sent: 1, failed: 0 });

    expect(pushes[0]).toMatchObject({
      apiKey: "klucz-obiektu",
      channexId: "chx-9",
      roomTypeId: "room-2",
    });
    expect(outboxUpdates[0]).toEqual({ ids: [1], data: { status: "SENT" } });
  });

  it("scalone zadania zamykają się razem — żadne nie zostaje w kolejce", async () => {
    // trzy zmiany w nachodzących terminach to jeden push, ale trzy zadania;
    // zamknięcie tylko jednego oznaczałoby wysyłanie tego samego bez końca
    rows = [
      { id: 1, unitTypeId: 7, dateFrom: "2026-08-10", dateTo: "2026-08-12" },
      { id: 2, unitTypeId: 7, dateFrom: "2026-08-11", dateTo: "2026-08-15" },
      { id: 3, unitTypeId: 7, dateFrom: "2026-08-14", dateTo: "2026-08-16" },
    ];

    const result = await processOutbox(3, provider);

    expect(pushes).toHaveLength(1); // jeden push na scalony zakres
    expect(result.sent).toBe(3);
    expect(outboxUpdates[0].ids).toEqual([1, 2, 3]);
  });

  it("różne typy pokoi to osobne pushe", async () => {
    rows = [
      { id: 1, unitTypeId: 7, dateFrom: "2026-08-10", dateTo: "2026-08-12" },
      { id: 2, unitTypeId: 8, dateFrom: "2026-08-10", dateTo: "2026-08-12" },
    ];

    const result = await processOutbox(3, provider);

    expect(pushes).toHaveLength(2);
    expect(result.sent).toBe(2);
  });
});

describe("processOutbox — awarie", () => {
  it("nieudany push zostawia zadanie w kolejce i podbija licznik prób", async () => {
    // status ERROR, nie SENT — inaczej zmiana dostępności przepadłaby cicho
    // i kanał sprzedawałby po nieaktualnym stanie
    pushError = new Error("Channex: HTTP 502");

    expect(await processOutbox(3, provider)).toEqual({ sent: 0, failed: 1 });

    expect(outboxUpdates[0].data).toMatchObject({
      status: "ERROR",
      attempts: { increment: 1 },
      lastError: "Channex: HTTP 502",
    });
    expect(events[0]).toMatchObject({ level: "ERROR" });
  });

  it("brak mapowania pokoju to błąd zadania, nie wyjątek z workera", async () => {
    room = null;

    expect(await processOutbox(3, provider)).toEqual({ sent: 0, failed: 1 });
    expect(outboxUpdates[0].data).toMatchObject({ status: "ERROR" });
    expect(String(outboxUpdates[0].data.lastError)).toContain("mapowania");
  });

  it("pokój zmapowany bez identyfikatora w Channex też jest błędem", async () => {
    room = { channexRoomTypeId: null, channexRatePlanId: "plan-1" };

    expect((await processOutbox(3, provider)).failed).toBe(1);
  });

  it("usunięty typ pokoju nie blokuje reszty kolejki", async () => {
    // pierwszy zakres padnie, drugi ma przejść — awaria jednego typu pokoju
    // nie może wstrzymać synchronizacji całego obiektu
    rows = [
      { id: 1, unitTypeId: 7, dateFrom: "2026-08-10", dateTo: "2026-08-12" },
      { id: 2, unitTypeId: 8, dateFrom: "2026-08-10", dateTo: "2026-08-12" },
    ];
    let call = 0;
    const failFirst = {
      pushAri: async (...args: unknown[]) => {
        if (call++ === 0) throw new Error("padło");
        pushes.push(args as never);
      },
    } as unknown as Parameters<typeof processOutbox>[1];

    const result = await processOutbox(3, failFirst);

    expect(result).toEqual({ sent: 1, failed: 1 });
  });

  it("długi komunikat błędu jest przycinany do rozmiaru kolumny", async () => {
    pushError = new Error("x".repeat(500));

    await processOutbox(3, provider);

    expect(String(outboxUpdates[0].data.lastError)).toHaveLength(300);
  });
});
