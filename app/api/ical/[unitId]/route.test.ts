import { beforeEach, describe, expect, it, vi } from "vitest";

// Eksport iCal jednostki — to, co Booking i Airbnb pobierają, żeby wiedzieć,
// kiedy pokój jest zajęty. Adres jest publiczny, więc sekretem jest token
// w parametrze: bez niego obłożenie obiektu byłoby zgadywalne po numerze
// jednostki. Zapytanie do bazy jest częścią kontraktu — do feedu nie mogą
// trafić rezerwacje niepotwierdzone ani blokady zaimportowane z kanałów.

type Unit = {
  id: number;
  name: string;
  icalToken: string | null;
  unitType: { name: string };
  reservations: { code: string; checkIn: string; checkOut: string }[];
  blocks: { id: number; startDate: string; endDate: string }[];
};

let unit: Unit | null = null;
const queries: { where: unknown; include: Record<string, unknown> }[] = [];

vi.mock("@/lib/db", () => ({
  prisma: {
    unit: {
      findUnique: async (args: (typeof queries)[number]) => {
        queries.push(args);
        return unit;
      },
    },
  },
}));

const { GET } = await import("./route");

const TOKEN = "tajny-token-jednostki";

const feed = (unitId: string, token?: string) =>
  GET(
    new Request(
      `https://rezflow.pl/api/ical/${unitId}${token === undefined ? "" : `?t=${encodeURIComponent(token)}`}`
    ),
    { params: Promise.resolve({ unitId }) }
  );

beforeEach(() => {
  queries.length = 0;
  unit = {
    id: 12,
    name: "Pokój 1",
    icalToken: TOKEN,
    unitType: { name: "Dwuosobowy" },
    reservations: [{ code: "HO-ABC123", checkIn: "2026-08-10", checkOut: "2026-08-14" }],
    blocks: [{ id: 7, startDate: "2026-09-01", endDate: "2026-09-03" }],
  };
});

describe("GET /api/ical/[unitId] — dostęp", () => {
  it("z poprawnym tokenem oddaje kalendarz", async () => {
    const res = await feed("12", TOKEN);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    expect(res.headers.get("content-disposition")).toContain("rezflow-unit-12.ics");
  });

  it("bez tokenu odmawia", async () => {
    expect((await feed("12")).status).toBe(403);
  });

  it("obcy token odmawia", async () => {
    expect((await feed("12", "nie-ten-token")).status).toBe(403);
  });

  it("prefiks poprawnego tokenu nie przechodzi", async () => {
    expect((await feed("12", TOKEN.slice(0, -1))).status).toBe(403);
    expect((await feed("12", `${TOKEN}x`)).status).toBe(403);
  });

  it("jednostka bez wygenerowanego tokenu jest zamknięta, także dla pustego tokenu", async () => {
    // fail-closed: brak sekretu nie może oznaczać feedu otwartego dla wszystkich
    unit = { ...unit!, icalToken: null };

    expect((await feed("12", "")).status).toBe(403);
    expect((await feed("12")).status).toBe(403);
  });

  it("nieznana jednostka to 404 — istnienie pokoju nie jest tajemnicą, jego obłożenie już tak", async () => {
    unit = null;
    expect((await feed("999", TOKEN)).status).toBe(404);
  });
});

describe("GET /api/ical/[unitId] — treść kalendarza", () => {
  const body = async () => (await feed("12", TOKEN)).text();

  it("jest poprawnie obudowanym plikiem iCal", async () => {
    const ics = await body();

    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics.split("\r\n").length).toBeGreaterThan(1); // linie łamane po CRLF
  });

  it("niesie terminy rezerwacji w formacie dziennym", async () => {
    const ics = await body();

    expect(ics).toContain("DTSTART;VALUE=DATE:20260810");
    expect(ics).toContain("DTEND;VALUE=DATE:20260814");
    expect(ics).toContain("SUMMARY:Rezerwacja HO-ABC123");
  });

  it("blokady ręczne wychodzą jako „Niedostępne”, bez ujawniania powodu", async () => {
    const ics = await body();

    expect(ics).toContain("SUMMARY:Niedostępne");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260901");
  });

  it("każde zdarzenie ma własny stały identyfikator", async () => {
    // bez UID kanały tworzą duplikaty przy każdym pobraniu feedu
    const ics = await body();

    expect(ics).toContain("UID:res-HO-ABC123@rezflow");
    expect(ics).toContain("UID:block-7@rezflow");
  });

  it("pusty kalendarz nadal jest poprawnym plikiem", async () => {
    unit = { ...unit!, reservations: [], blocks: [] };

    const ics = await body();
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  it("pobiera wyłącznie potwierdzone rezerwacje i blokady ręczne", async () => {
    // Wstępna rezerwacja może wygasnąć — wysłana do kanału zablokowałaby
    // sprzedaż. Blokada z importu iCal odesłana z powrotem do źródła robi
    // pętlę: kanał zobaczyłby własny termin jako zajęty u nas.
    await feed("12", TOKEN);

    const include = queries[0].include as {
      reservations: { where: { status: string } };
      blocks: { where: { source: string } };
    };
    expect(include.reservations.where).toEqual({ status: "CONFIRMED" });
    expect(include.blocks.where).toEqual({ source: "MANUAL" });
  });
});
