import { beforeEach, describe, expect, it, vi } from "vitest";

// Akcje panelu kanałów: przełącznik trybu synchronizacji i podłączanie
// Booking.com. Wszystkie przechodzą przez bramkę właściciela i planu, a swój
// wynik komunikują przekierowaniem — kod, który tu nie przekieruje, zostawia
// właściciela na ekranie bez informacji, czy cokolwiek się stało.

/** redirect() w Next rzuca; atrapa robi to samo, żeby dało się złapać cel. */
class RedirectError extends Error {
  constructor(readonly to: string) {
    super(`REDIRECT ${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
}));

const revalidated: string[] = [];
const afterCallbacks: (() => Promise<unknown>)[] = [];
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    revalidated.push(path);
  },
}));
vi.mock("next/server", () => ({
  after: (cb: () => Promise<unknown>) => {
    afterCallbacks.push(cb);
  },
}));

let owner = { property: { id: 3, plan: "PRO" } };
vi.mock("../auth", () => ({ requireOwner: async () => owner }));

let channexProperty: { propertyId: number; channexId: string; status: string } | null = null;
let channexChannel: { id: number; channexChannelId: string } | null = null;
let rooms: { channexRoomTypeId: string; channexRatePlanId: string }[] = [];

const propertyUpdates: Record<string, unknown>[] = [];
const cpUpdates: Record<string, unknown>[] = [];
const channelUpserts: { create: Record<string, unknown>; update: Record<string, unknown> }[] = [];
const channelUpdates: Record<string, unknown>[] = [];

vi.mock("../db", () => ({
  prisma: {
    property: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        propertyUpdates.push(data);
      },
    },
    channexProperty: {
      findUnique: async () => channexProperty,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        cpUpdates.push(data);
      },
    },
    channexChannel: {
      findUnique: async () => channexChannel,
      upsert: async (args: (typeof channelUpserts)[number]) => {
        channelUpserts.push(args);
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        channelUpdates.push(data);
      },
    },
    channexRoom: { findMany: async () => rooms },
  },
}));

vi.mock("../log", () => ({ logEvent: async () => {} }));

let connectResult: { channelId: string; status: string } | Error = {
  channelId: "chn-booking",
  status: "connected",
};
let statusResult: { status: string; message: string } | Error = { status: "connected", message: "" };
const connectCalls: { channexId: string; hotelId: string; mapping: unknown[] }[] = [];

let provider: Record<string, unknown> | null = null;
vi.mock("./provider", () => ({ channelProvider: () => provider }));

const provisioned: number[] = [];
const resyncs: number[] = [];
let provisionThrows = false;
vi.mock("./provision", () => ({
  provisionForProperty: async (id: number) => {
    if (provisionThrows) throw new Error("Channex padł");
    provisioned.push(id);
  },
}));
vi.mock("./enqueue-helpers", () => ({
  fullResync: async (id: number) => {
    resyncs.push(id);
  },
}));

const { setSyncMode } = await import("./sync-actions");
const { connectBookingChannel, refreshChannelStatus } = await import("./channel-actions");

const form = (entries: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};

/** Akcje kończą się przekierowaniem — zwraca jego cel. */
async function target(run: Promise<void>): Promise<string> {
  try {
    await run;
    throw new Error("akcja nie przekierowała");
  } catch (e) {
    if (e instanceof RedirectError) return e.to;
    throw e;
  }
}

beforeEach(() => {
  owner = { property: { id: 3, plan: "PRO" } };
  channexProperty = null;
  channexChannel = null;
  rooms = [{ channexRoomTypeId: "room-2", channexRatePlanId: "plan-1" }];
  connectResult = { channelId: "chn-booking", status: "connected" };
  statusResult = { status: "connected", message: "" };
  provider = {
    connectBooking: async (channexId: string, hotelId: string, mapping: unknown[]) => {
      connectCalls.push({ channexId, hotelId, mapping });
      if (connectResult instanceof Error) throw connectResult;
      return connectResult;
    },
    channelStatus: async () => {
      if (statusResult instanceof Error) throw statusResult;
      return statusResult;
    },
  };
  revalidated.length = 0;
  afterCallbacks.length = 0;
  propertyUpdates.length = 0;
  cpUpdates.length = 0;
  channelUpserts.length = 0;
  channelUpdates.length = 0;
  connectCalls.length = 0;
  provisioned.length = 0;
  resyncs.length = 0;
  provisionThrows = false;
});

describe("setSyncMode", () => {
  it("zapisuje wybrany tryb i odświeża ekran kanałów", async () => {
    expect(await target(setSyncMode(form({ mode: "ICAL" })))).toBe("/admin/kanaly?saved=1");

    expect(propertyUpdates).toEqual([{ syncMode: "ICAL" }]);
    expect(revalidated).toContain("/admin/kanaly");
  });

  it("nieznany tryb jest odrzucany bez zapisu", async () => {
    // wartość przychodzi z formularza, czyli od klienta
    const to = await target(setSyncMode(form({ mode: "WSZYSTKO" })));

    expect(to).toContain("error=");
    expect(propertyUpdates).toEqual([]);
  });

  it("brak trybu w formularzu też jest odrzucany", async () => {
    expect(await target(setSyncMode(new FormData()))).toContain("error=");
    expect(propertyUpdates).toEqual([]);
  });

  it("iCal wymaga planu Standard", async () => {
    owner = { property: { id: 3, plan: "FREE" } };

    const to = await target(setSyncMode(form({ mode: "ICAL" })));

    expect(decodeURIComponent(to)).toContain("Standard");
    expect(propertyUpdates).toEqual([]);
  });

  it("Channex wymaga planu Pro", async () => {
    owner = { property: { id: 3, plan: "STANDARD" } };

    const to = await target(setSyncMode(form({ mode: "CHANNEX" })));

    expect(decodeURIComponent(to)).toContain("Pro");
    expect(propertyUpdates).toEqual([]);
  });

  it("Channex wyłączony na platformie nie da się włączyć nawet w planie Pro", async () => {
    // bez integracji push nie miałby gdzie iść, a właściciel widziałby
    // „synchronizacja włączona" i nie rozumiał, dlaczego kanały milczą
    provider = null;

    const to = await target(setSyncMode(form({ mode: "CHANNEX" })));

    expect(decodeURIComponent(to)).toContain("Channex");
    expect(propertyUpdates).toEqual([]);
  });

  it("pierwsze włączenie Channex zakłada obiekt w kanałach po odpowiedzi", async () => {
    // provisioning to kilka żądań HTTP — właściciel nie może na nie czekać
    await target(setSyncMode(form({ mode: "CHANNEX" })));

    expect(propertyUpdates).toEqual([{ syncMode: "CHANNEX" }]);
    expect(provisioned).toEqual([]);

    await afterCallbacks[0]();
    expect(provisioned).toEqual([3]);
  });

  it("ponowne włączenie wznawia istniejące mapowanie, zamiast zakładać obiekt drugi raz", async () => {
    // drugi provisioning utworzyłby w Channex duplikat obiektu
    channexProperty = { propertyId: 3, channexId: "chx-9", status: "PAUSED" };

    await target(setSyncMode(form({ mode: "CHANNEX" })));
    await afterCallbacks[0]();

    expect(provisioned).toEqual([]);
    expect(cpUpdates).toEqual([{ status: "ACTIVE" }]);
    expect(resyncs).toEqual([3]);
  });

  it("awaria zakładania obiektu nie wywraca akcji — status zapisuje provisioning", async () => {
    provisionThrows = true;

    await target(setSyncMode(form({ mode: "CHANNEX" })));

    // akcja już przekierowała; wyjątek z tła jest wyłapany na miejscu,
    // a status ERROR zapisuje provisionForProperty
    await expect(afterCallbacks[0]()).resolves.toBeUndefined();
    expect(provisioned).toEqual([]);
  });

  it("powrót do iCal wstrzymuje push, ale zostawia mapowanie", async () => {
    // PAUSED, nie usunięcie: powrót do Channex ma być jednym kliknięciem,
    // bez zakładania obiektu od nowa
    channexProperty = { propertyId: 3, channexId: "chx-9", status: "ACTIVE" };

    await target(setSyncMode(form({ mode: "ICAL" })));

    expect(cpUpdates).toEqual([{ status: "PAUSED" }]);
  });

  it("wyłączenie synchronizacji też wstrzymuje push", async () => {
    channexProperty = { propertyId: 3, channexId: "chx-9", status: "ACTIVE" };

    await target(setSyncMode(form({ mode: "OFF" })));

    expect(cpUpdates).toEqual([{ status: "PAUSED" }]);
  });

  it("obiekt bez mapowania Channex nie próbuje niczego wstrzymywać", async () => {
    await target(setSyncMode(form({ mode: "OFF" })));

    expect(cpUpdates).toEqual([]);
  });
});

describe("connectBookingChannel", () => {
  beforeEach(() => {
    channexProperty = { propertyId: 3, channexId: "chx-9", status: "ACTIVE" };
  });

  it("podłącza kanał z identyfikatorem hotelu i mapowaniem pokoi", async () => {
    expect(await target(connectBookingChannel(form({ hotelId: "1234567" })))).toBe(
      "/admin/kanaly?saved=1"
    );

    expect(connectCalls[0]).toMatchObject({ channexId: "chx-9", hotelId: "1234567" });
    expect(connectCalls[0].mapping).toEqual([{ roomTypeId: "room-2", ratePlanId: "plan-1" }]);
    expect(channelUpserts[0].create).toMatchObject({
      propertyId: 3,
      type: "BOOKING",
      channexChannelId: "chn-booking",
      status: "CONNECTED", // status od Channex przychodzi małymi literami
    });
  });

  it("odrzuca identyfikator hotelu, który nie jest liczbą", async () => {
    for (const hotelId of ["", "abc", "12", "12a", "-1"]) {
      const to = await target(connectBookingChannel(form({ hotelId })));
      expect(decodeURIComponent(to), `hotelId=${hotelId}`).toContain("Hotel ID");
    }
    expect(connectCalls).toEqual([]);
  });

  it("plan bez Channex nie podłącza kanału", async () => {
    owner = { property: { id: 3, plan: "STANDARD" } };

    const to = await target(connectBookingChannel(form({ hotelId: "1234567" })));

    expect(decodeURIComponent(to)).toContain("Pro");
    expect(connectCalls).toEqual([]);
  });

  it("niedokończona konfiguracja Channex nie podłącza kanału", async () => {
    channexProperty = { propertyId: 3, channexId: "chx-9", status: "PENDING" };

    const to = await target(connectBookingChannel(form({ hotelId: "1234567" })));

    expect(decodeURIComponent(to)).toContain("konfigurację");
    expect(connectCalls).toEqual([]);
  });

  it("błąd Channex zapisuje się przy kanale i wraca w komunikacie", async () => {
    connectResult = new Error("Hotel ID nie należy do tego konta");

    const to = await target(connectBookingChannel(form({ hotelId: "1234567" })));

    expect(decodeURIComponent(to)).toContain("nie należy do tego konta");
    expect(channelUpserts[0].update).toMatchObject({ status: "ERROR" });
  });

  it("długi komunikat błędu jest przycinany do rozmiaru kolumny", async () => {
    connectResult = new Error("x".repeat(500));

    await target(connectBookingChannel(form({ hotelId: "1234567" })));

    expect(String(channelUpserts[0].update.lastError)).toHaveLength(300);
  });
});

describe("refreshChannelStatus", () => {
  beforeEach(() => {
    channexProperty = { propertyId: 3, channexId: "chx-9", status: "ACTIVE" };
    channexChannel = { id: 11, channexChannelId: "chn-booking" };
  });

  it("zapisuje świeży status i komunikat kanału", async () => {
    statusResult = { status: "error", message: "Brak mapowania pokoi po stronie OTA" };

    expect(await target(refreshChannelStatus(form({ type: "BOOKING" })))).toBe(
      "/admin/kanaly?saved=1"
    );

    expect(channelUpdates).toEqual([
      { status: "ERROR", lastError: "Brak mapowania pokoi po stronie OTA" },
    ]);
  });

  it("awaria zapytania zostawia poprzedni status, zamiast go zerować", async () => {
    // „nie wiem" jest gorsze od ostatniego znanego stanu — właściciel
    // podejmuje na tej podstawie decyzje
    statusResult = new Error("timeout");

    await target(refreshChannelStatus(form({ type: "BOOKING" })));

    expect(channelUpdates).toEqual([]);
  });

  it("kanał nigdy niepodłączony nie ma czego odświeżać", async () => {
    channexChannel = null;

    expect(await target(refreshChannelStatus(form({ type: "AIRBNB" })))).toBe(
      "/admin/kanaly?saved=1"
    );
    expect(channelUpdates).toEqual([]);
  });
});
