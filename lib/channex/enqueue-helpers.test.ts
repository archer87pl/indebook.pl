import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Wyzwalacze synchronizacji ARI wpinane w akcje panelu. Ich zadanie: po każdej
// zmianie dostępności dopisać zadanie do kolejki i spróbować wysłać je od razu,
// nie blokując odpowiedzi. Kluczowa jest kolejność — zadanie MUSI wylądować
// w kolejce przed próbą wysyłki, bo tylko kolejka przetrwa awarię pushu
// (dobierze ją cron).

const enqueued: { propertyId: number; unitTypeId: number; from: string; to: string }[] = [];
const processed: number[] = [];
const order: string[] = [];
let processThrows = false;

vi.mock("./outbox", () => ({
  enqueueAri: async (propertyId: number, unitTypeId: number, from: string, to: string) => {
    order.push("enqueue");
    enqueued.push({ propertyId, unitTypeId, from, to });
  },
  processOutbox: async (propertyId: number) => {
    order.push("process");
    if (processThrows) throw new Error("Channex padł");
    processed.push(propertyId);
    return { sent: 0, failed: 0 };
  },
}));

let unit: {
  unitTypeId: number;
  unitType: { propertyId: number; property: { syncMode: string } };
} | null = null;
let unitTypes: { id: number }[] = [];

vi.mock("../db", () => ({
  prisma: {
    unit: { findUnique: async () => unit },
    unitType: { findMany: async () => unitTypes },
  },
}));

const afterCallbacks: (() => unknown)[] = [];
let afterThrows = false;
vi.mock("next/server", () => ({
  after: (cb: () => unknown) => {
    if (afterThrows) throw new Error("after() poza kontekstem żądania");
    afterCallbacks.push(cb);
  },
}));

const { afterAri, fullResync, syncUnitRange } = await import("./enqueue-helpers");

beforeEach(() => {
  enqueued.length = 0;
  processed.length = 0;
  order.length = 0;
  afterCallbacks.length = 0;
  afterThrows = false;
  processThrows = false;
  unit = { unitTypeId: 7, unitType: { propertyId: 3, property: { syncMode: "CHANNEX" } } };
  unitTypes = [{ id: 7 }, { id: 8 }];
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 29, 12, 0, 0));
});

afterEach(() => vi.useRealTimers());

describe("afterAri", () => {
  it("zapisuje zadanie do kolejki i odkłada wysyłkę na po odpowiedzi", async () => {
    await afterAri(3, 7, "2026-08-10", "2026-08-12");

    expect(enqueued).toEqual([{ propertyId: 3, unitTypeId: 7, from: "2026-08-10", to: "2026-08-12" }]);
    // sam push jeszcze się nie zaczął — właściciel nie czeka na Channex
    expect(processed).toEqual([]);

    await afterCallbacks[0]();
    expect(processed).toEqual([3]);
  });

  it("zadanie trafia do kolejki PRZED próbą wysyłki", async () => {
    // odwrotna kolejność oznaczałaby, że push nie widzi świeżej zmiany,
    // a przy jego awarii nie ma czego dobrać cronem
    await afterAri(3, 7, "2026-08-10", "2026-08-12");
    await afterCallbacks[0]();

    expect(order).toEqual(["enqueue", "process"]);
  });

  it("poza kontekstem żądania (cron, webhook) wysyła bez after()", async () => {
    afterThrows = true;

    await afterAri(3, 7, "2026-08-10", "2026-08-12");

    expect(enqueued).toHaveLength(1);
    await vi.waitFor(() => expect(processed).toEqual([3]));
  });

  it("awaria wysyłki nie wywraca akcji, która ją zleciła", async () => {
    // zmiana rezerwacji musi się zapisać nawet wtedy, gdy Channex leży
    afterThrows = true;
    processThrows = true;

    await expect(afterAri(3, 7, "2026-08-10", "2026-08-12")).resolves.toBeUndefined();
    await vi.waitFor(() => expect(order).toContain("process"));
    expect(enqueued).toHaveLength(1); // zadanie zostaje dla crona
  });
});

describe("syncUnitRange", () => {
  it("w trybie Channex zleca synchronizację typu pokoju tej jednostki", async () => {
    await syncUnitRange(12, "2026-08-10", "2026-08-12");

    expect(enqueued).toEqual([{ propertyId: 3, unitTypeId: 7, from: "2026-08-10", to: "2026-08-12" }]);
  });

  it("obiekt w trybie iCal nie dostaje zadań ARI", async () => {
    // helper jest wołany w każdej akcji ruszającej rezerwację, więc sam musi
    // sprawdzać tryb — inaczej kolejka rosłaby dla obiektów bez Channex
    unit!.unitType.property.syncMode = "ICAL";

    await syncUnitRange(12, "2026-08-10", "2026-08-12");

    expect(enqueued).toEqual([]);
  });

  it("obiekt bez synchronizacji nie dostaje zadań ARI", async () => {
    unit!.unitType.property.syncMode = "OFF";

    await syncUnitRange(12, "2026-08-10", "2026-08-12");

    expect(enqueued).toEqual([]);
  });

  it("nieznana jednostka nie wywraca akcji", async () => {
    unit = null;

    await expect(syncUnitRange(999, "2026-08-10", "2026-08-12")).resolves.toBeUndefined();
    expect(enqueued).toEqual([]);
  });
});

describe("fullResync", () => {
  it("zleca okno 540 dni od dziś dla każdego typu pokoju i przetwarza kolejkę", async () => {
    // horyzont ~18 miesięcy: tyle wprzód sprzedają Booking i Airbnb
    await fullResync(3);

    expect(enqueued).toEqual([
      { propertyId: 3, unitTypeId: 7, from: "2026-07-29", to: "2028-01-20" },
      { propertyId: 3, unitTypeId: 8, from: "2026-07-29", to: "2028-01-20" },
    ]);
    expect(processed).toEqual([3]);
  });

  it("obiekt bez typów pokoi nie wysyła pustego pushu", async () => {
    unitTypes = [];

    await fullResync(3);

    expect(enqueued).toEqual([]);
    // processOutbox i tak wołamy — kolejka może mieć zaległości z wcześniej
    expect(processed).toEqual([3]);
  });
});
