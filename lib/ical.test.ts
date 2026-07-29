import { describe, expect, it, vi } from "vitest";

// Parser feedów przychodzących z Booking, Airbnb i Vrbo. To jedyne miejsce,
// w którym obce dane decydują o dostępności — pomyłka o jedną dobę daje
// podwójną rezerwację albo blokuje wolny termin. Feedy są brzydkie: CRLF,
// zawijane linie, parametry przy właściwościach, daty z czasem i bez.
vi.mock("./db", () => ({ prisma: {} }));
vi.mock("./log", () => ({ logEvent: async () => {} }));

const { parseIcsBusyRanges } = await import("./ical");

/** Składa feed z podanych VEVENT-ów, w formacie z prawdziwych kalendarzy (CRLF). */
function feed(...events: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Test//PL",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

const event = (lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");

describe("parseIcsBusyRanges", () => {
  it("czyta całodniowy blok Airbnb (DTEND wyłączny)", () => {
    // Airbnb: VALUE=DATE, DTEND to dzień WYJAZDU — czyli pierwszy wolny.
    const ranges = parseIcsBusyRanges(
      feed(
        event([
          "DTSTART;VALUE=DATE:20260703",
          "DTEND;VALUE=DATE:20260706",
          "SUMMARY:Airbnb (Not available)",
        ])
      )
    );

    expect(ranges).toEqual([
      { start: "2026-07-03", end: "2026-07-06", summary: "Airbnb (Not available)" },
    ]);
  });

  it("blok z czasem sprowadza do dat dziennych", () => {
    // Booking bywa wysyła DTSTART z godziną w UTC
    const ranges = parseIcsBusyRanges(
      feed(
        event([
          "DTSTART:20260703T140000Z",
          "DTEND:20260706T100000Z",
          "SUMMARY:CLOSED - Not available",
        ])
      )
    );

    expect(ranges[0].start).toBe("2026-07-03");
    expect(ranges[0].end).toBe("2026-07-06");
  });

  it("właściwość z parametrem TZID nie myli parsera", () => {
    const ranges = parseIcsBusyRanges(
      feed(
        event([
          "DTSTART;TZID=Europe/Warsaw:20260703T150000",
          "DTEND;TZID=Europe/Warsaw:20260705T110000",
        ])
      )
    );

    expect(ranges[0]).toMatchObject({ start: "2026-07-03", end: "2026-07-05" });
  });

  it("brak DTEND oznacza jedną dobę", () => {
    const ranges = parseIcsBusyRanges(feed(event(["DTSTART;VALUE=DATE:20261231"])));

    // przełom roku sprawdza też dodawanie dnia, nie sklejanie napisów
    expect(ranges[0]).toMatchObject({ start: "2026-12-31", end: "2027-01-01" });
  });

  it("DTEND nie późniejszy niż DTSTART też daje jedną dobę", () => {
    // zdarza się w feedach eksportowanych z błędem; zakres pusty lub ujemny
    // przepuszczony dalej blokowałby zero dni albo wywracał zapytania
    const sameDay = parseIcsBusyRanges(
      feed(event(["DTSTART;VALUE=DATE:20260703", "DTEND;VALUE=DATE:20260703"]))
    );
    expect(sameDay[0]).toMatchObject({ start: "2026-07-03", end: "2026-07-04" });

    const reversed = parseIcsBusyRanges(
      feed(event(["DTSTART;VALUE=DATE:20260703", "DTEND;VALUE=DATE:20260701"]))
    );
    expect(reversed[0]).toMatchObject({ start: "2026-07-03", end: "2026-07-04" });
  });

  it("skleja zawinięte linie (RFC 5545 line folding)", () => {
    // Linie dłuższe niż 75 oktetów są łamane i wcinane spacją — łamane
    // W DOWOLNYM miejscu, także w środku słowa. Przy sklejaniu znika CRLF
    // razem ze spacją-znacznikiem, więc „mie" + „ sci" daje „miesci".
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20260703",
      "DTEND;VALUE=DATE:20260705",
      "SUMMARY:Rezerwacja bardzo dlugiego opisu ktory nie mie",
      " sci sie w jednej linii",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    expect(parseIcsBusyRanges(ics)[0].summary).toBe(
      "Rezerwacja bardzo dlugiego opisu ktory nie miesci sie w jednej linii"
    );
  });

  it("czyta wszystkie zdarzenia z feedu, zachowując kolejność", () => {
    const ranges = parseIcsBusyRanges(
      feed(
        event(["DTSTART;VALUE=DATE:20260703", "DTEND;VALUE=DATE:20260705"]),
        event(["DTSTART;VALUE=DATE:20260710", "DTEND;VALUE=DATE:20260712"]),
        event(["DTSTART;VALUE=DATE:20260801", "DTEND;VALUE=DATE:20260802"])
      )
    );

    expect(ranges.map((r) => r.start)).toEqual(["2026-07-03", "2026-07-10", "2026-08-01"]);
  });

  it("zdarzenie bez DTSTART jest pomijane, reszta feedu zostaje", () => {
    // pojedynczy śmieciowy wpis nie może kosztować całej synchronizacji
    const ranges = parseIcsBusyRanges(
      feed(
        event(["SUMMARY:Wpis bez daty"]),
        event(["DTSTART;VALUE=DATE:20260703", "DTEND;VALUE=DATE:20260705"])
      )
    );

    expect(ranges).toHaveLength(1);
    expect(ranges[0].start).toBe("2026-07-03");
  });

  it("niepoprawna data nie przechodzi jako zakres", () => {
    const ranges = parseIcsBusyRanges(feed(event(["DTSTART;VALUE=DATE:nie-data"])));
    expect(ranges).toEqual([]);
  });

  it("feed ucięty w połowie oddaje to, co zdążył zadeklarować", () => {
    // połączenie zerwane w trakcie pobierania: ostatni VEVENT bez END
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20260703",
      "DTEND;VALUE=DATE:20260705",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20260710",
    ].join("\r\n");

    const ranges = parseIcsBusyRanges(ics);
    expect(ranges).toHaveLength(2);
    expect(ranges[1]).toMatchObject({ start: "2026-07-10", end: "2026-07-11" });
  });

  it("pusty kalendarz i pusty tekst dają pustą listę", () => {
    expect(parseIcsBusyRanges(feed())).toEqual([]);
    expect(parseIcsBusyRanges("")).toEqual([]);
  });

  it("radzi sobie z samym LF, bez powrotu karetki", () => {
    // niektóre eksporty (i nasze własne testy) używają \n
    const ics =
      "BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;VALUE=DATE:20260703\n" +
      "DTEND;VALUE=DATE:20260705\nSUMMARY:Zajete\nEND:VEVENT\nEND:VCALENDAR";

    expect(parseIcsBusyRanges(ics)).toEqual([
      { start: "2026-07-03", end: "2026-07-05", summary: "Zajete" },
    ]);
  });

  it("brak SUMMARY daje pusty opis, a nie undefined", () => {
    // opis ląduje w Block.note, które jest w bazie wymagane
    const ranges = parseIcsBusyRanges(
      feed(event(["DTSTART;VALUE=DATE:20260703", "DTEND;VALUE=DATE:20260704"]))
    );
    expect(ranges[0].summary).toBe("");
  });
});
