import { beforeEach, describe, expect, it, vi } from "vitest";

// Zakładanie obiektu w Channex. Jednorazowa operacja, po której kanały
// zaczynają sprzedawać, więc wynik musi się zapisać w całości albo wcale:
// klucz API bez mapowania pokoi to obiekt, do którego nie da się wysłać
// dostępności, a mapowanie bez klucza — mapowanie, którym nie ma jak się
// posłużyć. Nieudany provisioning musi zostawić czytelny ślad w panelu.

let property: {
  name: string;
  address: string;
  checkInFrom: string;
  checkOutTo: string;
  unitTypes: { id: number; name: string; maxGuests: number; units: { id: number }[] }[];
} | null = null;

let provisionResult:
  | { channexPropertyId: string; apiKey: string; rooms: { unitTypeId: number; roomTypeId: string; ratePlanId: string }[] }
  | Error = {
  channexPropertyId: "chx-9",
  apiKey: "klucz-obiektu",
  rooms: [{ unitTypeId: 7, roomTypeId: "room-2", ratePlanId: "plan-1" }],
};
let webhookError: Error | null = null;

const provisionInputs: unknown[] = [];
const webhookCalls: { channexPropertyId: string; url: string; secret: string }[] = [];
const propertyUpserts: { create: Record<string, unknown>; update: Record<string, unknown> }[] = [];
const roomUpserts: { unitTypeId: number; create: Record<string, unknown> }[] = [];
const events: { level?: string; message: string; meta?: string }[] = [];
const resyncs: number[] = [];
const order: string[] = [];

vi.mock("../db", () => {
  const tx = {
    channexProperty: {
      upsert: async (args: (typeof propertyUpserts)[number]) => {
        order.push("upsert-property");
        propertyUpserts.push(args);
      },
    },
    channexRoom: {
      upsert: async ({
        where,
        create,
      }: {
        where: { unitTypeId: number };
        create: Record<string, unknown>;
      }) => {
        order.push("upsert-room");
        roomUpserts.push({ unitTypeId: where.unitTypeId, create });
      },
    },
  };
  return {
    prisma: {
      property: {
        findUniqueOrThrow: async () => {
          if (!property) throw new Error("Nie ma takiego obiektu");
          return property;
        },
      },
      channexProperty: tx.channexProperty,
      $transaction: async (fn: (t: typeof tx) => Promise<void>) => fn(tx),
    },
  };
});

vi.mock("../log", () => ({
  logEvent: async (e: (typeof events)[number]) => {
    events.push(e);
  },
}));

vi.mock("./enqueue-helpers", () => ({
  fullResync: async (propertyId: number) => {
    order.push("resync");
    resyncs.push(propertyId);
  },
}));

let provider: Record<string, unknown> | null = null;
vi.mock("./provider", () => ({ channelProvider: () => provider }));

const { buildProvisionInput, provisionForProperty } = await import("./provision");

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://rezflow.pl");
  vi.stubEnv("CHANNEX_WEBHOOK_SECRET", "sekret-webhooka");
  property = {
    name: "Willa Pod Dębem",
    address: "Zakopane",
    checkInFrom: "15:00",
    checkOutTo: "11:00",
    unitTypes: [
      { id: 7, name: "Dwuosobowy", maxGuests: 2, units: [{ id: 101 }, { id: 102 }] },
    ],
  };
  provisionResult = {
    channexPropertyId: "chx-9",
    apiKey: "klucz-obiektu",
    rooms: [{ unitTypeId: 7, roomTypeId: "room-2", ratePlanId: "plan-1" }],
  };
  webhookError = null;
  provisionInputs.length = 0;
  webhookCalls.length = 0;
  propertyUpserts.length = 0;
  roomUpserts.length = 0;
  events.length = 0;
  resyncs.length = 0;
  order.length = 0;
  provider = {
    provisionProperty: async (input: unknown) => {
      provisionInputs.push(input);
      if (provisionResult instanceof Error) throw provisionResult;
      return provisionResult;
    },
    registerWebhook: async (channexPropertyId: string, url: string, secret: string) => {
      if (webhookError) throw webhookError;
      webhookCalls.push({ channexPropertyId, url, secret });
    },
  };
});

describe("buildProvisionInput", () => {
  it("przenosi dane obiektu i liczbę AKTYWNYCH jednostek jako liczbę pokoi", () => {
    // Channex sprzedaje tyle pokoi, ile mu podamy — jednostka wyłączona
    // ze sprzedaży policzona tutaj oznaczałaby oversell
    const input = buildProvisionInput(
      { name: "Willa", address: "Zakopane", checkInFrom: "15:00", checkOutTo: "11:00" },
      [{ id: 7, name: "Dwuosobowy", maxGuests: 2, activeUnits: 2 }]
    );

    expect(input).toEqual({
      name: "Willa",
      address: "Zakopane",
      currency: "PLN",
      timezone: "Europe/Warsaw",
      checkInFrom: "15:00",
      checkOutTo: "11:00",
      rooms: [{ unitTypeId: 7, title: "Dwuosobowy", occupancy: 2, count: 2 }],
    });
  });

  it("obiekt bez typów pokoi daje pustą listę, a nie undefined", () => {
    const input = buildProvisionInput(
      { name: "Willa", address: "", checkInFrom: "15:00", checkOutTo: "11:00" },
      []
    );
    expect(input.rooms).toEqual([]);
  });
});

describe("provisionForProperty — sukces", () => {
  it("zapisuje klucz API i mapowanie pokoi, po czym wysyła pełny stan do kanałów", async () => {
    await provisionForProperty(3);

    expect(propertyUpserts[0].create).toMatchObject({
      propertyId: 3,
      channexId: "chx-9",
      apiKey: "klucz-obiektu",
      status: "ACTIVE",
    });
    expect(roomUpserts).toEqual([
      {
        unitTypeId: 7,
        create: {
          unitTypeId: 7,
          channexRoomTypeId: "room-2",
          channexRatePlanId: "plan-1",
        },
      },
    ]);
    expect(resyncs).toEqual([3]);
  });

  it("klucz i mapowanie zapisują się w jednej transakcji, przed pierwszym pushem", async () => {
    // push bez mapowania nie miałby gdzie iść; kolejność jest tu istotą
    await provisionForProperty(3);

    expect(order).toEqual(["upsert-property", "upsert-room", "resync"]);
  });

  it("ponowny provisioning czyści poprzedni błąd", async () => {
    await provisionForProperty(3);

    expect(propertyUpserts[0].update).toMatchObject({ status: "ACTIVE", lastError: "" });
  });

  it("liczy tylko aktywne jednostki — nieaktywne nie idą do Channex", async () => {
    // findUniqueOrThrow filtruje po `active: true`, więc do wejścia trafia
    // dokładnie tyle, ile jest w sprzedaży
    property!.unitTypes[0].units = [{ id: 101 }];

    await provisionForProperty(3);

    expect((provisionInputs[0] as { rooms: { count: number }[] }).rooms[0].count).toBe(1);
  });

  it("rejestruje webhook rezerwacji na naszym adresie", async () => {
    await provisionForProperty(3);

    expect(webhookCalls).toEqual([
      {
        channexPropertyId: "chx-9",
        url: "https://rezflow.pl/api/channex/webhook",
        secret: "sekret-webhooka",
      },
    ]);
  });

  it("bez sekretu webhooka pomija rejestrację, ale kończy provisioning", async () => {
    // self-host bez sekretu i tak może pushować ARI — brakuje tylko
    // powiadomień o rezerwacjach z OTA
    vi.stubEnv("CHANNEX_WEBHOOK_SECRET", "");

    await provisionForProperty(3);

    expect(webhookCalls).toEqual([]);
    expect(resyncs).toEqual([3]);
  });

  it("nieudana rejestracja webhooka nie przewraca provisioningu, tylko ostrzega", async () => {
    // obiekt jest już założony w Channex — przerwanie tutaj zostawiłoby go
    // w połowie, a webhook da się dorejestrować później
    webhookError = new Error("webhook już istnieje");

    await provisionForProperty(3);

    expect(events[0]).toMatchObject({ level: "WARN" });
    expect(events[0].message).toContain("webhooka");
    expect(resyncs).toEqual([3]); // provisioning dobiegł końca
  });
});

describe("provisionForProperty — awarie", () => {
  it("bez skonfigurowanego Channex odmawia od razu", async () => {
    provider = null;

    await expect(provisionForProperty(3)).rejects.toThrow(/nie jest skonfigurowany/);
    expect(propertyUpserts).toEqual([]);
  });

  it("błąd Channex zapisuje status ERROR z komunikatem i leci dalej do wołającego", async () => {
    // akcja panelu musi zobaczyć wyjątek, żeby pokazać właścicielowi błąd,
    // a status w bazie — żeby ekran kanałów nie udawał, że wszystko działa
    provisionResult = new Error("Channex: nieprawidłowy klucz API");

    await expect(provisionForProperty(3)).rejects.toThrow(/nieprawidłowy klucz API/);

    expect(propertyUpserts[0].create).toMatchObject({
      propertyId: 3,
      status: "ERROR",
      lastError: "Channex: nieprawidłowy klucz API",
    });
    expect(events.at(-1)).toMatchObject({ level: "ERROR" });
  });

  it("po nieudanym provisioningu nie wysyła stanu do kanałów", async () => {
    provisionResult = new Error("padło");

    await expect(provisionForProperty(3)).rejects.toThrow();

    expect(resyncs).toEqual([]);
    expect(roomUpserts).toEqual([]);
  });

  it("długi komunikat błędu jest przycinany do rozmiaru kolumny", async () => {
    provisionResult = new Error("x".repeat(500));

    await expect(provisionForProperty(3)).rejects.toThrow();

    expect(String(propertyUpserts[0].create.lastError)).toHaveLength(300);
  });

  it("nieistniejący obiekt kończy się błędem, nie cichym zapisem", async () => {
    property = null;

    await expect(provisionForProperty(999)).rejects.toThrow();
  });
});
