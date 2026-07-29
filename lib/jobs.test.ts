import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKIN_RETENTION_DAYS } from "./checkin";

// Zadania okresowe kasują dane i zmieniają statusy bez udziału człowieka —
// za szeroki warunek `where` kasuje coś, czego nikt nie miał zamiaru stracić.
// Testy patrzą właśnie na te warunki: co dokładnie job wybiera do usunięcia.

type Where = Record<string, unknown>;
const queries: { model: string; where: Where; data?: Where }[] = [];
let counts: Record<string, number> = {};
let activeChannex: { propertyId: number }[] = [];
const outboxCalls: number[] = [];

function recorder(model: string) {
  return async ({ where, data }: { where: Where; data?: Where }) => {
    queries.push({ model, where, data });
    return { count: counts[model] ?? 0 };
  };
}

let due: Reservation[] = [];
const dueQueries: Record<string, unknown>[] = [];
const mails: { to: string; subject: string; body: string }[] = [];
const smses: { to: string; body: string }[] = [];
const localeAsked: string[] = [];

type Reservation = {
  id: number;
  code: string;
  locale: string;
  email: string;
  phone: string;
  checkInStatus: string;
  unit: {
    unitType: {
      property: { name: string; checkInFrom: string; arrivalInfo: string };
    };
  };
};

vi.mock("./db", () => ({
  prisma: {
    reservation: {
      updateMany: recorder("reservation"),
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        dueQueries.push(where);
        return due;
      },
      update: recorder("reservationUpdate"),
    },
    checkInCard: { deleteMany: recorder("checkInCard") },
    session: { deleteMany: recorder("session") },
    passwordResetToken: { deleteMany: recorder("passwordResetToken") },
    rateLimit: { deleteMany: recorder("rateLimit") },
    eventLog: { deleteMany: recorder("eventLog") },
    channexProperty: { findMany: async () => activeChannex },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

// zależności zadań, których tu nie testujemy — mają własne pliki testowe
vi.mock("./mailer", () => ({
  sendMail: async (m: { to: string; subject: string; body: string }) => {
    mails.push(m);
  },
}));
vi.mock("./sms", () => ({
  sendSms: async (s: { to: string; body: string }) => {
    smses.push(s);
  },
}));
vi.mock("./ical", () => ({ syncIcalFeed: async () => ({ ok: true, imported: 0 }) }));
vi.mock("./guest-mail", () => ({
  guestT: async (locale: string) => {
    localeAsked.push(locale);
    // Zamiast treści oddajemy klucz z parametrami: treść pilnują testy
    // słowników, a tutaj liczy się, KTÓRY komunikat poszedł, w jakim języku
    // i z jakimi wstawkami (np. z linkiem do opinii).
    return (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key;
  },
}));
vi.mock("./rates/refresh", () => ({ refreshRates: async () => 0 }));
vi.mock("./channex/outbox", () => ({
  processOutbox: async (propertyId: number) => {
    outboxCalls.push(propertyId);
    return { sent: 2 };
  },
}));

const {
  expireReservations,
  sendArrivalReminders,
  sendReviewRequests,
  processAllChannexOutbox,
  purgeExpiredCheckIns,
  purgeExpiredRateLimits,
  purgeExpiredSessions,
  purgeOldEventLogs,
} = await import("./jobs");

const NOW = new Date("2026-07-29T12:00:00Z");

beforeEach(() => {
  queries.length = 0;
  outboxCalls.length = 0;
  dueQueries.length = 0;
  mails.length = 0;
  smses.length = 0;
  localeAsked.length = 0;
  due = [];
  counts = {};
  activeChannex = [];
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const last = (model: string) => queries.filter((q) => q.model === model).at(-1)!;

describe("expireReservations", () => {
  it("anuluje wyłącznie wstępne rezerwacje po terminie zaliczki", () => {
    // gdyby warunek objął CONFIRMED, job kasowałby opłacone pobyty
    expireReservations();

    expect(last("reservation").where).toEqual({
      status: "PENDING",
      expiresAt: { lt: NOW },
    });
    expect(last("reservation").data).toEqual({ status: "CANCELLED" });
  });

  it("oddaje liczbę wygaszonych rezerwacji", async () => {
    counts.reservation = 3;
    expect(await expireReservations()).toBe(3);
  });
});

describe("purgeExpiredCheckIns", () => {
  it("kasuje karty meldunkowe dopiero po okresie retencji", async () => {
    // karta zawiera dane z dokumentu tożsamości — trzymamy ją najkrócej,
    // jak pozwalają przepisy, ale ani dnia krócej niż deklarujemy
    await purgeExpiredCheckIns();

    expect(CHECKIN_RETENTION_DAYS).toBe(365);
    expect(last("checkInCard").where).toEqual({
      reservation: { checkOut: { lt: "2025-07-29" } },
    });
  });

  it("liczy po dacie WYJAZDU, nie po dacie utworzenia karty", async () => {
    await purgeExpiredCheckIns();
    expect(JSON.stringify(last("checkInCard").where)).toContain("checkOut");
  });
});

describe("purgeExpiredSessions", () => {
  it("kasuje wygasłe sesje i tokeny resetu w jednej transakcji", async () => {
    counts.session = 5;

    const removed = await purgeExpiredSessions();

    expect(removed).toBe(5);
    expect(last("session").where).toEqual({ expiresAt: { lt: NOW } });
    expect(last("passwordResetToken").where).toEqual({ expiresAt: { lt: NOW } });
  });

  it("nie rusza sesji jeszcze ważnych", async () => {
    await purgeExpiredSessions();
    // próg to „mniejsze niż teraz” — sesja wygasająca za sekundę zostaje
    expect((last("session").where as { expiresAt: { lt: Date } }).expiresAt.lt).toEqual(NOW);
  });
});

describe("purgeExpiredRateLimits", () => {
  it("kasuje tylko zamknięte okna licznika", async () => {
    await purgeExpiredRateLimits();
    expect(last("rateLimit").where).toEqual({ resetAt: { lt: NOW } });
  });
});

describe("purgeOldEventLogs", () => {
  it("trzyma dziennik przez 90 dni", async () => {
    await purgeOldEventLogs();

    const cutoff = (last("eventLog").where as { createdAt: { lt: Date } }).createdAt.lt;
    const days = (NOW.getTime() - cutoff.getTime()) / 86_400_000;
    expect(days).toBe(90);
  });
});

describe("processAllChannexOutbox", () => {
  it("przetwarza kolejkę tylko aktywnych połączeń i sumuje wysyłki", async () => {
    activeChannex = [{ propertyId: 4 }, { propertyId: 9 }];

    expect(await processAllChannexOutbox()).toBe(4); // 2 obiekty × 2 wysyłki
    expect(outboxCalls).toEqual([4, 9]);
  });

  it("brak aktywnych połączeń to zero roboty, a nie błąd", async () => {
    expect(await processAllChannexOutbox()).toBe(0);
    expect(outboxCalls).toEqual([]);
  });
});

// Wiadomości wychodzące do gościa. Tu liczy się nie treść (tę pilnują testy
// słowników), tylko KOGO job wybiera, ILE razy i o jakiej porze.
function reservation(over: Partial<Reservation> = {}): Reservation {
  return {
    id: 55,
    code: "HO-ABC123",
    locale: "pl",
    email: "gosc@example.com",
    phone: "+48600100200",
    checkInStatus: "NONE",
    unit: {
      unitType: {
        property: { name: "Willa Pod Dębem", checkInFrom: "15:00", arrivalInfo: "" },
      },
    },
    ...over,
  };
}

/** Ustawia godzinę LOKALNĄ — job patrzy na getHours(), nie na UTC. */
const atHour = (hour: number) => vi.setSystemTime(new Date(2026, 6, 29, hour, 0, 0));

describe("sendArrivalReminders", () => {
  it("bierze jutrzejsze przyjazdy, którym jeszcze nie przypomniano", async () => {
    // flaga arrivalReminderAt to cała idempotencja tego zadania: cron chodzi
    // co godzinę, a gość ma dostać jedno przypomnienie, nie kilkanaście
    atHour(10);
    await sendArrivalReminders();

    expect(dueQueries[0]).toEqual({
      status: "CONFIRMED",
      checkIn: "2026-07-30",
      arrivalReminderAt: null,
    });
  });

  it("wysyła e-mail i SMS, po czym odznacza rezerwację", async () => {
    atHour(10);
    due = [reservation()];

    expect(await sendArrivalReminders()).toBe(1);

    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe("gosc@example.com");
    expect(smses).toHaveLength(1);
    expect(last("reservationUpdate").where).toEqual({ id: 55 });
    expect(last("reservationUpdate").data).toHaveProperty("arrivalReminderAt");
  });

  it("nie budzi gości w nocy", async () => {
    // wysyłka tylko 8–21; poza oknem job nie rusza nawet bazy
    due = [reservation()];

    for (const hour of [0, 5, 7, 21, 23]) {
      atHour(hour);
      expect(await sendArrivalReminders(), `godzina ${hour}`).toBe(0);
    }
    expect(dueQueries).toEqual([]);
    expect(mails).toEqual([]);
  });

  it("granice okna wysyłki: 8 tak, 21 nie", async () => {
    due = [reservation()];

    atHour(8);
    expect(await sendArrivalReminders()).toBe(1);

    mails.length = 0;
    atHour(20);
    expect(await sendArrivalReminders()).toBe(1);
  });

  it("prosi o tłumaczenia w języku rezerwacji, nie w języku serwera", async () => {
    atHour(10);
    due = [reservation({ locale: "de" })];

    await sendArrivalReminders();

    expect(localeAsked).toEqual(["de"]);
  });

  it("gość bez meldunku dostaje link do meldunku", async () => {
    atHour(10);
    due = [reservation({ checkInStatus: "NONE" })];

    await sendArrivalReminders();

    expect(mails[0].body).toContain("/r/HO-ABC123/meldunek");
    expect(smses[0].body).toContain("/r/HO-ABC123/meldunek");
  });

  it("gość po meldunku dostaje informacje na przyjazd zamiast linku", async () => {
    atHour(10);
    due = [
      reservation({
        checkInStatus: "COMPLETED",
        unit: {
          unitType: {
            property: {
              name: "Willa",
              checkInFrom: "15:00",
              arrivalInfo: "Kod do bramy: 1234",
            },
          },
        },
      }),
    ];

    await sendArrivalReminders();

    expect(mails[0].body).toContain("Kod do bramy: 1234");
    expect(mails[0].body).not.toContain("/meldunek");
  });

  it("rezerwacja recepcyjna bez prawdziwego adresu nie generuje maila", async () => {
    // ręczne rezerwacje dostają adres zastępczy @rezflow.local — wysyłka
    // pod niego to gwarantowany bounce psujący reputację domeny
    atHour(10);
    due = [reservation({ email: "recepcja-55@rezflow.local" })];

    await sendArrivalReminders();

    expect(mails).toEqual([]);
    expect(smses).toHaveLength(1); // SMS nadal ma sens
  });

  it("brak telefonu to sam e-mail", async () => {
    atHour(10);
    due = [reservation({ phone: "" })];

    await sendArrivalReminders();

    expect(mails).toHaveLength(1);
    expect(smses).toEqual([]);
  });

  it("brak przyjazdów na jutro to zero wysyłek", async () => {
    atHour(10);
    expect(await sendArrivalReminders()).toBe(0);
    expect(mails).toEqual([]);
  });
});

describe("sendReviewRequests", () => {
  it("pyta o opinię dzień po wyjeździe i tylko tych, którzy jeszcze jej nie wystawili", async () => {
    // `review: null` chroni przed proszeniem o opinię kogoś, kto już ją napisał
    atHour(10);
    await sendReviewRequests();

    expect(dueQueries[0]).toEqual({
      status: "CONFIRMED",
      checkOut: "2026-07-28",
      reviewRequestedAt: null,
      review: null,
    });
  });

  it("wysyła prośbę i odznacza rezerwację", async () => {
    atHour(10);
    due = [reservation()];

    expect(await sendReviewRequests()).toBe(1);

    expect(mails[0].body).toContain("/r/HO-ABC123/opinia");
    expect(smses).toHaveLength(1);
    expect(last("reservationUpdate").data).toHaveProperty("reviewRequestedAt");
  });

  it("też respektuje ciszę nocną", async () => {
    due = [reservation()];
    atHour(23);

    expect(await sendReviewRequests()).toBe(0);
    expect(dueQueries).toEqual([]);
  });

  it("prośba idzie w języku rezerwacji", async () => {
    atHour(10);
    due = [reservation({ locale: "en" })];

    await sendReviewRequests();

    expect(localeAsked).toEqual(["en"]);
  });

  it("adres zastępczy recepcji jest pomijany", async () => {
    atHour(10);
    due = [reservation({ email: "recepcja-55@rezflow.local", phone: "" })];

    await sendReviewRequests();

    expect(mails).toEqual([]);
    // rezerwację i tak odznaczamy, żeby nie wracała w każdym biegu
    expect(last("reservationUpdate").data).toHaveProperty("reviewRequestedAt");
  });
});
