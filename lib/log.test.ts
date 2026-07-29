import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Dziennik zdarzeń platformy. Kontrakt jest prosty i twardy: logEvent NIGDY
// nie rzuca — zapis do dziennika nie może wywrócić rezerwacji ani płatności,
// w środku których jest wołany.

type Row = Record<string, unknown>;

const rows: Row[] = [];
let failDb = false;

vi.mock("./db", () => ({
  prisma: {
    eventLog: {
      create: async ({ data }: { data: Row }) => {
        if (failDb) throw new Error("baza padła");
        rows.push(data);
      },
    },
  },
}));

const { EVENT_KINDS, logEvent } = await import("./log");

beforeEach(() => {
  rows.length = 0;
  failDb = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("logEvent", () => {
  it("zapisuje zdarzenie z domyślnym poziomem INFO", async () => {
    await logEvent({ kind: "RESERVATION", message: "Nowa rezerwacja HO-ABC" });

    expect(rows[0]).toMatchObject({
      kind: "RESERVATION",
      message: "Nowa rezerwacja HO-ABC",
      level: "INFO",
      propertyId: null,
      meta: "",
    });
  });

  it("przepuszcza jawny poziom i przypisanie do obiektu", async () => {
    await logEvent({
      kind: "PAYMENT",
      level: "ERROR",
      message: "Odrzucona płatność",
      propertyId: 12,
      meta: "P24 błąd 401",
    });

    expect(rows[0]).toMatchObject({ level: "ERROR", propertyId: 12, meta: "P24 błąd 401" });
  });

  it("ucina długą treść i metadane do 500 znaków", async () => {
    // kolumny mają limit; dłuższy wpis wywaliłby zapis, czyli i operację
    await logEvent({
      kind: "ICAL",
      message: "x".repeat(900),
      meta: "y".repeat(900),
    });

    expect(rows[0].message).toHaveLength(500);
    expect(rows[0].meta).toHaveLength(500);
  });

  it("awaria bazy nie wychodzi na zewnątrz", async () => {
    failDb = true;
    await expect(logEvent({ kind: "AUTH", message: "Logowanie" })).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("EVENT_KINDS", () => {
  it("każdy rodzaj zdarzenia ma etykietę do filtra w panelu", () => {
    // rodzaj bez etykiety zniknąłby z listy filtrów i jego wpisy byłyby
    // nieosiągalne dla superadmina
    expect(EVENT_KINDS.map((k) => k.key)).toEqual([
      "RESERVATION",
      "PAYMENT",
      "MAIL",
      "SMS",
      "ICAL",
      "CHANNEX",
      "ADMIN",
      "AUTH",
    ]);
    expect(EVENT_KINDS.every((k) => k.label.length > 0)).toBe(true);
  });
});
