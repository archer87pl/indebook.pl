import { beforeEach, describe, expect, it, vi } from "vitest";

// Eksport rezerwacji do CSV. Trzy rzeczy muszą tu być pewne: eksportuje
// wyłącznie własny obiekt, plik otwiera się w polskim Excelu (BOM + średnik),
// a dane z karty meldunkowej (dokument tożsamości) nie opuszczają systemu.

type Reservation = {
  id: number;
  code: string;
  status: string;
  source: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  guestName: string;
  email: string;
  phone: string;
  nip: string;
  promoCode: string;
  checkInStatus: string;
  discountGr: number;
  totalGr: number;
  depositGr: number;
  createdAt: Date;
  unit: { name: string; unitType: { name: string } };
};

let user: { property: { id: number; slug: string } | null } | null = null;
let rows: Reservation[] = [];
const findManyArgs: Record<string, unknown>[] = [];

vi.mock("@/lib/auth", () => ({ getSessionUser: async () => user }));
vi.mock("@/lib/db", () => ({
  prisma: {
    reservation: {
      findMany: async (args: Record<string, unknown>) => {
        findManyArgs.push(args);
        // kursor: druga strona jest pusta, chyba że test poda więcej danych
        const cursor = args.cursor as { id: number } | undefined;
        return cursor ? rows.filter((r) => r.id < cursor.id) : rows;
      },
    },
  },
}));

const { GET } = await import("./route");

function reservation(over: Partial<Reservation> = {}): Reservation {
  return {
    id: 100,
    code: "HO-ABC123",
    status: "CONFIRMED",
    source: "DIRECT",
    checkIn: "2026-08-10",
    checkOut: "2026-08-14",
    guests: 2,
    guestName: "Anna Kowalska",
    email: "anna@example.com",
    phone: "+48600100200",
    nip: "",
    promoCode: "",
    checkInStatus: "COMPLETED",
    discountGr: 0,
    totalGr: 120000,
    depositGr: 36000,
    createdAt: new Date("2026-07-01T10:30:00Z"),
    unit: { name: "Pokój 1", unitType: { name: "Dwuosobowy" } },
    ...over,
  };
}

const csv = async (): Promise<string> => (await GET()).text();

beforeEach(() => {
  user = { property: { id: 3, slug: "willa-rezflow" } };
  rows = [reservation()];
  findManyArgs.length = 0;
});

describe("GET /api/admin/export — dostęp", () => {
  it("niezalogowany nie pobiera niczego", async () => {
    user = null;
    expect((await GET()).status).toBe(401);
  });

  it("konto bez obiektu nie pobiera niczego", async () => {
    user = { property: null };
    expect((await GET()).status).toBe(401);
  });

  it("eksport jest ograniczony do obiektu z sesji", async () => {
    // identyfikator obiektu bierze się z sesji, nie z parametru — inaczej
    // dałoby się pobrać cudzą listę rezerwacji, zmieniając liczbę w adresie
    await csv();

    expect(findManyArgs[0].where).toEqual({ unit: { unitType: { propertyId: 3 } } });
  });

  it("nazwa pliku niesie obiekt i datę", async () => {
    const res = await GET();
    expect(res.headers.get("content-disposition")).toContain("rezerwacje-willa-rezflow-");
    expect(res.headers.get("content-type")).toContain("text/csv");
  });
});

describe("GET /api/admin/export — plik", () => {
  it("otwiera się w polskim Excelu: BOM i średniki", async () => {
    // BOM sprawdzamy na bajtach, bo dekoder tekstu go zdejmuje — a to
    // właśnie te trzy bajty mówią Excelowi, że plik jest w UTF-8
    const bytes = new Uint8Array(await (await GET()).arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);

    const text = await csv();
    expect(text.split("\r\n")[0]).toContain("Kod;Status;Źródło");
  });

  it("wiersz zawiera dane rezerwacji z policzonymi nocami i kwotami po polsku", async () => {
    const [, row] = (await csv()).split("\r\n");

    expect(row).toContain("HO-ABC123");
    expect(row).toContain("Anna Kowalska");
    expect(row).toContain(";4;"); // 10→14 sierpnia to 4 noce
    expect(row).toContain("1200,00"); // przecinek dziesiętny
    expect(row).toContain("360,00");
  });

  it("dane karty meldunkowej nie trafiają do pliku — tylko TAK/NIE", async () => {
    // karta zawiera numer dokumentu tożsamości; eksport ma mówić wyłącznie,
    // czy meldunek został wypełniony
    rows = [reservation({ checkInStatus: "COMPLETED" }), reservation({ id: 99, checkInStatus: "NEW" })];

    const text = await csv();
    const lines = text.split("\r\n");

    expect(lines[1]).toContain(";TAK;");
    expect(lines[2]).toContain(";NIE;");
    expect(text).not.toMatch(/dowod|paszport|documentNumber/i);
  });

  it("średnik w nazwisku nie rozjeżdża kolumn", async () => {
    // bez cytowania jedno pole rozpadłoby się na dwie kolumny i przesunęło
    // cały wiersz — kwoty wylądowałyby pod innymi nagłówkami
    rows = [reservation({ guestName: "Kowalska; Anna" })];

    const [, row] = (await csv()).split("\r\n");

    expect(row).toContain('"Kowalska; Anna"');
    expect(row.split(";")).toHaveLength(20); // 19 kolumn + rozcięty cudzysłów
  });

  it("cudzysłów w danych jest podwajany zgodnie z CSV", async () => {
    rows = [reservation({ guestName: 'Anna "Ania" Kowalska' })];

    const [, row] = (await csv()).split("\r\n");
    expect(row).toContain('"Anna ""Ania"" Kowalska"');
  });

  it("znak nowej linii w danych nie tworzy nowego wiersza", async () => {
    rows = [reservation({ guestName: "Anna\nKowalska" })];

    const row = (await csv()).split("\r\n")[1];
    expect(row.startsWith('HO-ABC123;CONFIRMED')).toBe(true);
    expect(row).toContain('"Anna');
  });

  it("obiekt bez rezerwacji daje sam nagłówek, a nie pusty plik", async () => {
    rows = [];

    const text = await csv();
    expect(text).toContain("Kod;Status");
    expect(text.split("\r\n").filter(Boolean)).toHaveLength(1);
  });

  it("pobiera dane porcjami, po kursorze — nie ładuje całej historii naraz", async () => {
    await csv();

    expect(findManyArgs[0].take).toBe(500);
    expect(findManyArgs[0].orderBy).toEqual({ id: "desc" });
  });
});
