import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IcalFeed } from "@prisma/client";

// Pobieranie feedu kanału i wykrywanie podwójnych rezerwacji. Adres feedu
// podaje właściciel, więc pobranie musi przejść przez zaporę SSRF, a błąd
// jednego kanału nie może wywrócić synchronizacji pozostałych — zamiast tego
// ma wylądować przy feedzie, żeby właściciel wiedział, co naprawić.

const blockDeletes: Record<string, unknown>[] = [];
const blockCreates: Record<string, unknown>[][] = [];
const feedUpdates: Record<string, unknown>[] = [];
const events: { level?: string; message: string; meta?: string }[] = [];

let blocks: unknown[] = [];
let conflictingReservation: unknown = null;
let assertUrlError: Error | null = null;
const checkedUrls: string[] = [];

vi.mock("./db", () => ({
  prisma: {
    block: {
      findMany: async () => blocks,
      deleteMany: async (args: { where: Record<string, unknown> }) => {
        blockDeletes.push(args.where);
        return { count: 0 };
      },
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
        blockCreates.push(data);
        return { count: data.length };
      },
    },
    reservation: { findFirst: async () => conflictingReservation },
    icalFeed: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        feedUpdates.push(data);
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

vi.mock("./log", () => ({
  logEvent: async (e: (typeof events)[number]) => {
    events.push(e);
  },
}));

vi.mock("./net", () => ({
  assertPublicUrl: async (url: string) => {
    checkedUrls.push(url);
    if (assertUrlError) throw assertUrlError;
  },
}));

const { findChannelConflicts, syncIcalFeed } = await import("./ical");

const FEED = {
  id: 4,
  unitId: 12,
  url: "https://ical.booking.com/kalendarz.ics",
  name: "Booking.com",
  channel: "BOOKING",
} as IcalFeed;

const NOW = new Date("2026-07-29T12:00:00Z");

function ics(...events: string[]): string {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", ...events, "END:VCALENDAR"].join("\r\n");
}
const vevent = (start: string, end: string, summary = "Zajete") =>
  [
    "BEGIN:VEVENT",
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${summary}`,
    "END:VEVENT",
  ].join("\r\n");

function respondWith(body: string, init: ResponseInit = {}) {
  const spy = vi.fn(async () => new Response(body, init));
  vi.stubGlobal("fetch", spy);
  return spy;
}

beforeEach(() => {
  blockDeletes.length = 0;
  blockCreates.length = 0;
  feedUpdates.length = 0;
  events.length = 0;
  checkedUrls.length = 0;
  blocks = [];
  conflictingReservation = null;
  assertUrlError = null;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("syncIcalFeed — udane pobranie", () => {
  it("podmienia blokady kanału na aktualne zajęte terminy", async () => {
    respondWith(ics(vevent("20260810", "20260814", "Rezerwacja Booking")));

    const result = await syncIcalFeed(FEED);

    expect(result).toEqual({ ok: true, imported: 1 });
    // najpierw kasujemy poprzedni stan TEGO feedu — inaczej odwołane terminy
    // zostawałyby zablokowane na zawsze
    expect(blockDeletes[0]).toEqual({ feedId: 4 });
    expect(blockCreates[0][0]).toMatchObject({
      unitId: 12,
      startDate: "2026-08-10",
      endDate: "2026-08-14",
      source: "ICAL",
      feedId: 4,
      note: "Rezerwacja Booking",
    });
  });

  it("kasuje blokady wyłącznie tego feedu, nie całej jednostki", async () => {
    // jednostka może mieć kilka kanałów i blokady ręczne — te muszą przeżyć
    respondWith(ics(vevent("20260810", "20260814")));

    await syncIcalFeed(FEED);

    expect(blockDeletes[0]).not.toHaveProperty("unitId");
    expect(blockDeletes[0]).not.toHaveProperty("source");
  });

  it("pomija terminy z przeszłości", async () => {
    // historia obłożenia nie jest nam do niczego potrzebna, a rosłaby bez końca
    respondWith(
      ics(
        vevent("20250101", "20250105"), // dawno minione
        vevent("20260801", "20260803") // przyszłe
      )
    );

    const result = await syncIcalFeed(FEED);

    expect(result.imported).toBe(1);
    expect(blockCreates[0]).toHaveLength(1);
    expect(blockCreates[0][0]).toMatchObject({ startDate: "2026-08-01" });
  });

  it("termin trwający w tej chwili zostaje — gość jeszcze nie wyjechał", async () => {
    respondWith(ics(vevent("20260727", "20260731")));

    expect((await syncIcalFeed(FEED)).imported).toBe(1);
  });

  it("bez opisu w feedzie blokada dostaje nazwę kanału", async () => {
    respondWith(ics("BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260801\r\nEND:VEVENT"));

    await syncIcalFeed(FEED);

    expect(blockCreates[0][0]).toMatchObject({ note: "Booking.com" });
  });

  it("odnotowuje udaną synchronizację i czyści poprzedni błąd", async () => {
    respondWith(ics(vevent("20260810", "20260814")));

    await syncIcalFeed(FEED);

    expect(feedUpdates.at(-1)).toMatchObject({ lastError: "" });
    expect(feedUpdates.at(-1)!.lastSyncAt).toEqual(NOW);
  });

  it("pusty kalendarz zwalnia wszystkie terminy tego kanału", async () => {
    // wszystkie rezerwacje w OTA odwołane — u nas też mają zniknąć
    respondWith(ics());

    const result = await syncIcalFeed(FEED);

    expect(result).toEqual({ ok: true, imported: 0 });
    expect(blockDeletes[0]).toEqual({ feedId: 4 });
    expect(blockCreates[0]).toEqual([]);
  });
});

describe("syncIcalFeed — pobranie z zaporą i błędami", () => {
  it("adres feedu przechodzi przez zaporę SSRF przed pobraniem", async () => {
    const fetchSpy = respondWith(ics());

    await syncIcalFeed(FEED);

    expect(checkedUrls).toEqual([FEED.url]);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("adres wskazujący zasób wewnętrzny nie jest w ogóle pobierany", async () => {
    // właściciel wkleja dowolny URL — bez tej bramki feed byłby sondą
    // do sieci wewnętrznej serwera
    assertUrlError = new Error("Adres wskazuje zasób wewnętrzny.");
    const fetchSpy = respondWith(ics());

    const result = await syncIcalFeed({ ...FEED, url: "http://169.254.169.254/latest/meta-data" });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(blockCreates).toEqual([]);
  });

  it("nie idzie za przekierowaniem — to obejście zapory", async () => {
    respondWith(ics());

    await syncIcalFeed(FEED);

    const init = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0][1];
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeDefined(); // limit czasu, żeby cron nie wisiał
  });

  it("odpowiedź z błędem HTTP nie kasuje istniejących blokad", async () => {
    // gdyby kasowała, awaria po stronie kanału zwalniałaby zajęte terminy
    // i wystawiała je na sprzedaż
    respondWith("Not found", { status: 404 });

    const result = await syncIcalFeed(FEED);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("404");
    expect(blockDeletes).toEqual([]);
    expect(blockCreates).toEqual([]);
  });

  it("treść, która nie jest kalendarzem, jest odrzucana", async () => {
    // typowy błąd właściciela: wkleja adres strony logowania zamiast .ics
    respondWith("<!doctype html><html>Zaloguj się</html>");

    const result = await syncIcalFeed(FEED);

    expect(result.error).toContain("iCal");
    expect(blockCreates).toEqual([]);
  });

  it("błąd zapisuje się przy feedzie i w dzienniku, ale nie leci wyżej", async () => {
    // cron synchronizuje wszystkie kanały po kolei — wyjątek z jednego
    // przerwałby resztę
    respondWith("Server error", { status: 500 });

    await expect(syncIcalFeed(FEED)).resolves.toMatchObject({ ok: false, imported: 0 });

    expect(feedUpdates.at(-1)).toMatchObject({ lastError: expect.stringContaining("500") });
    expect(events[0]).toMatchObject({ level: "ERROR" });
    expect(events[0].message).toContain("Booking.com");
  });

  it("zerwane połączenie też kończy się zapisem błędu, nie wyjątkiem", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      })
    );

    const result = await syncIcalFeed(FEED);

    expect(result.ok).toBe(false);
    expect(feedUpdates.at(-1)).toMatchObject({ lastError: "ECONNRESET" });
  });
});

describe("findChannelConflicts", () => {
  const block = (over: Record<string, unknown> = {}) => ({
    id: 1,
    unitId: 12,
    startDate: "2026-08-10",
    endDate: "2026-08-14",
    unit: { name: "Pokój 1", unitType: { name: "Dwuosobowy" } },
    feed: { name: "Booking.com" },
    ...over,
  });

  it("zgłasza termin zajęty w kanale i sprzedany bezpośrednio", async () => {
    // to jest właśnie podwójna rezerwacja — recepcja musi ją zobaczyć,
    // zanim zobaczy ją gość na miejscu
    blocks = [block()];
    conflictingReservation = { id: 77, code: "HO-ABC123" };

    const conflicts = await findChannelConflicts(3);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      unitName: "Pokój 1",
      unitTypeName: "Dwuosobowy",
      reservation: { code: "HO-ABC123" },
    });
  });

  it("blokada bez kolidującej rezerwacji nie jest konfliktem", async () => {
    blocks = [block()];
    conflictingReservation = null;

    expect(await findChannelConflicts(3)).toEqual([]);
  });

  it("brak blokad z kanałów to brak konfliktów", async () => {
    blocks = [];
    expect(await findChannelConflicts(3)).toEqual([]);
  });
});
