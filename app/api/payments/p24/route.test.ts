import { beforeEach, describe, expect, it, vi } from "vitest";

// Webhook Przelewy24 (urlStatus). Wchodzi z internetu i przestawia rezerwację
// na CONFIRMED, czyli zamyka termin i wysyła gościowi potwierdzenie. Każde
// przepuszczone tu żądanie to pokój oddany za darmo — bramek jest pięć:
// istnienie rezerwacji, podpis kluczem CRC obiektu, status, kwota
// i potwierdzenie transakcji w API operatora.

type Reservation = {
  id: number;
  code: string;
  status: string;
  depositGr: number;
  email: string;
  phone: string;
  checkIn: string;
  expiresAt: Date | null;
  unit: { unitType: { property: { id: number; p24Crc: string } } };
};

let reservation: Reservation | null = null;
const updates: { where: unknown; data: Record<string, unknown> }[] = [];
const mails: { to: string; subject: string }[] = [];
const smses: { to: string }[] = [];
const events: { kind: string; message: string }[] = [];

let signOk = true;
let verifyOk = true;
const signChecks: { crc: string }[] = [];

vi.mock("@/lib/db", () => ({
  prisma: {
    reservation: {
      findUnique: async () => reservation,
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        updates.push(args);
        return { ...reservation, ...args.data };
      },
    },
  },
}));

vi.mock("@/lib/payments", () => ({
  verifyP24NotificationSign: (_n: unknown, property: { p24Crc: string }) => {
    signChecks.push({ crc: property.p24Crc });
    return signOk;
  },
  verifyP24Transaction: async () => verifyOk,
}));

vi.mock("@/lib/mailer", () => ({
  sendMail: async (m: { to: string; subject: string }) => {
    mails.push(m);
  },
}));
vi.mock("@/lib/sms", () => ({
  sendSms: async (s: { to: string }) => {
    smses.push(s);
  },
}));
vi.mock("@/lib/log", () => ({
  logEvent: async (e: { kind: string; message: string }) => {
    events.push(e);
  },
}));
vi.mock("@/lib/checkin", () => ({ checkInUrl: (code: string) => `https://rezflow.pl/meldunek/${code}` }));

const { POST } = await import("./route");

const DEPOSIT = 12000;

function seed(overrides: Partial<Reservation> = {}): void {
  reservation = {
    id: 1,
    code: "HO-ABC123",
    status: "PENDING",
    depositGr: DEPOSIT,
    email: "gosc@example.com",
    phone: "+48600100200",
    checkIn: "2026-08-10",
    expiresAt: new Date("2026-07-29T13:00:00Z"),
    unit: { unitType: { property: { id: 3, p24Crc: "crc-obiektu-3" } } },
    ...overrides,
  };
}

const notify = (body: unknown) =>
  POST(
    new Request("https://rezflow.pl/api/payments/p24", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );

const payment = (over: Record<string, unknown> = {}) => ({
  sessionId: "HO-ABC123",
  amount: DEPOSIT,
  orderId: 987654,
  ...over,
});

beforeEach(() => {
  reservation = null;
  updates.length = 0;
  mails.length = 0;
  smses.length = 0;
  events.length = 0;
  signChecks.length = 0;
  signOk = true;
  verifyOk = true;
  seed();
});

describe("POST /api/payments/p24", () => {
  it("księguje zaliczkę: potwierdza rezerwację, zdejmuje termin blokady i zapisuje numer zamówienia", async () => {
    const res = await notify(payment());

    expect(res.status).toBe(200);
    expect(updates).toHaveLength(1);
    expect(updates[0].data).toEqual({
      status: "CONFIRMED",
      expiresAt: null, // rezerwacja przestaje być kandydatem do wygaszenia
      paymentOrderId: "987654",
    });
  });

  it("wysyła gościowi potwierdzenie z linkiem do meldunku i SMS", async () => {
    await notify(payment());

    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe("gosc@example.com");
    expect(mails[0].subject).toContain("HO-ABC123");
    expect(smses).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "PAYMENT" });
  });

  it("bez numeru telefonu nie próbuje wysłać SMS-a", async () => {
    seed({ phone: "" });

    await notify(payment());

    expect(mails).toHaveLength(1);
    expect(smses).toEqual([]);
  });

  it("podpis sprawdza kluczem CRC obiektu, do którego należy rezerwacja", async () => {
    // konfiguracja P24 jest per obiekt — użycie cudzego CRC pozwoliłoby
    // właścicielowi jednego obiektu potwierdzać rezerwacje w innym
    await notify(payment());

    expect(signChecks).toEqual([{ crc: "crc-obiektu-3" }]);
  });

  it("nieznany kod rezerwacji to 404 i żadnego zapisu", async () => {
    reservation = null;

    const res = await notify(payment({ sessionId: "HO-NIE-MA" }));

    expect(res.status).toBe(404);
    expect(updates).toEqual([]);
    expect(mails).toEqual([]);
  });

  it("zły podpis odrzuca powiadomienie", async () => {
    signOk = false;

    const res = await notify(payment());

    expect(res.status).toBe(400);
    expect(updates).toEqual([]);
    expect(mails).toEqual([]);
  });

  it("podpis jest sprawdzany przed kwotą i statusem", async () => {
    // inaczej odpowiedzi zdradzałyby stan cudzej rezerwacji komuś,
    // kto nie zna klucza CRC
    signOk = false;
    seed({ status: "CANCELLED" });

    const res = await notify(payment({ amount: 1 }));

    expect(await res.text()).toBe("Invalid signature");
  });

  it("kwota niższa niż zaliczka nie potwierdza rezerwacji", async () => {
    // wpłata 1 zł zamiast zaliczki nie może zamknąć terminu
    const res = await notify(payment({ amount: DEPOSIT - 1 }));

    expect(res.status).toBe(400);
    expect(updates).toEqual([]);
    expect(mails).toEqual([]);
  });

  it("kwota wyższa niż zaliczka też nie przechodzi", async () => {
    // rozjazd w drugą stronę oznacza pomyłkę operatora albo podmianę kwoty
    expect((await notify(payment({ amount: DEPOSIT + 1 }))).status).toBe(400);
    expect(updates).toEqual([]);
  });

  it("powtórzone powiadomienie dla potwierdzonej rezerwacji kończy się OK, ale bez drugiego maila", async () => {
    // P24 ponawia urlStatus; idempotencja chroni gościa przed duplikatem
    // potwierdzenia, a właściciela przed podwójnym wpisem w dzienniku
    seed({ status: "CONFIRMED" });

    const res = await notify(payment());

    expect(res.status).toBe(200);
    expect(updates).toEqual([]);
    expect(mails).toEqual([]);
    expect(events).toEqual([]);
  });

  it("anulowana rezerwacja nie daje się reaktywować płatnością", async () => {
    seed({ status: "CANCELLED" });

    const res = await notify(payment());

    expect(res.status).toBe(400);
    expect(updates).toEqual([]);
  });

  it("brak potwierdzenia transakcji w API operatora blokuje księgowanie", async () => {
    // sam poprawny podpis nie wystarcza — pytamy P24, czy pieniądze są
    verifyOk = false;

    const res = await notify(payment());

    expect(res.status).toBe(400);
    expect(updates).toEqual([]);
    expect(mails).toEqual([]);
  });

  it("treść, która nie jest JSON-em, to 400 zamiast wywrotki", async () => {
    const res = await notify("to nie jest json");

    expect(res.status).toBe(400);
    expect(updates).toEqual([]);
  });
});
