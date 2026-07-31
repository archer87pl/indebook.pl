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
let icalFeeds: { id: number }[] = [];
let smartRateTypes: { id: number; dynamicRates: { fetchedAt: Date }[] }[] = [];
const typeQueries: Record<string, unknown>[] = [];
const syncedFeeds: number[] = [];
const refreshCalls: { unitTypeId: number; from: string; to: string }[] = [];
let refreshReturns: number[] = [];
/** Ile „zajmuje" jedno odświeżenie na zegarze testowym (budżet crona). */
let refreshTakesMs = 0;
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
    icalFeed: { findMany: async () => icalFeeds },
    unitType: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        typeQueries.push(args.where);
        return smartRateTypes;
      },
    },
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
vi.mock("./ical", () => ({
  syncIcalFeed: async (f: { id: number }) => {
    syncedFeeds.push(f.id);
    return { ok: true, imported: 0 };
  },
}));
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
vi.mock("./rates/refresh", () => ({
  refreshRates: async (unitTypeId: number, from: string, to: string) => {
    refreshCalls.push({ unitTypeId, from, to });
    if (refreshTakesMs) vi.advanceTimersByTime(refreshTakesMs);
    return refreshReturns.shift() ?? 0;
  },
}));
vi.mock("./channex/outbox", () => ({
  processOutbox: async (propertyId: number) => {
    outboxCalls.push(propertyId);
    return { sent: 2 };
  },
}));

const {
  byStalestFirst,
  refreshAllRates,
  syncAllIcalFeeds,
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
  icalFeeds = [];
  smartRateTypes = [];
  typeQueries.length = 0;
  syncedFeeds.length = 0;
  refreshCalls.length = 0;
  refreshReturns = [];
  refreshTakesMs = 0;
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
  it("bierze przyjazdy z okna DZIŚ–JUTRO, którym jeszcze nie przypomniano", async () => {
    // Znacznik arrivalReminderAt to cała idempotencja tego zadania — gość ma
    // dostać jedno przypomnienie. Okno zamiast jednej daty jest po to, żeby
    // przebieg ucięty w połowie pętli dało się dokończyć nazajutrz: przy
    // sztywnym „jutro" goście z końca listy nigdy nie zostaliby złapani.
    atHour(10);
    await sendArrivalReminders();

    expect(dueQueries[0]).toEqual({
      status: "CONFIRMED",
      checkIn: { gte: "2026-07-29", lte: "2026-07-30" },
      arrivalReminderAt: null,
    });
  });

  it("nie przypomina o przyjeździe, który już był", async () => {
    // dolna granica okna to DZIŚ; sięgnięcie wstecz oznaczałoby wiadomość
    // „jutro przyjeżdżasz" wysłaną komuś, kto właśnie się wymeldowuje
    atHour(10);
    await sendArrivalReminders();

    const okno = dueQueries[0].checkIn as { gte: string };
    expect(okno.gte).toBe("2026-07-29"); // dzisiaj, nie wcześniej
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
      // okno tygodnia wstecz — patrz komentarz przy przypomnieniach o przyjeździe
      checkOut: { gte: "2026-07-22", lte: "2026-07-28" },
      reviewRequestedAt: null,
      review: null,
    });
  });

  it("nie prosi o opinię przed wymeldowaniem", async () => {
    // górna granica to WCZORAJ; gość w trakcie pobytu nie ma czego oceniać
    atHour(10);
    await sendReviewRequests();

    const okno = dueQueries[0].checkOut as { lte: string };
    expect(okno.lte).toBe("2026-07-28"); // wczoraj, nie dziś
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

describe("syncAllIcalFeeds", () => {
  it("synchronizuje każdy feed w systemie i oddaje ich liczbę", async () => {
    // to cron globalny (instrumentation.ts / trasa crona) — bierze feedy
    // wszystkich obiektów, w przeciwieństwie do akcji panelu
    icalFeeds = [{ id: 61 }, { id: 62 }, { id: 63 }];

    expect(await syncAllIcalFeeds()).toBe(3);
    expect(syncedFeeds).toEqual([61, 62, 63]);
  });

  it("brak feedów to zero roboty", async () => {
    icalFeeds = [];
    expect(await syncAllIcalFeeds()).toBe(0);
  });
});

describe("byStalestFirst", () => {
  const t = (id: number, fetchedAt?: string) => ({
    id,
    dynamicRates: fetchedAt ? [{ fetchedAt: new Date(fetchedAt) }] : [],
  });

  it("najdawniej odświeżane idą pierwsze", async () => {
    const sorted = byStalestFirst([
      t(1, "2026-07-30T10:00:00Z"),
      t(2, "2026-07-28T10:00:00Z"),
      t(3, "2026-07-29T10:00:00Z"),
    ]);

    expect(sorted.map((x) => x.id)).toEqual([2, 3, 1]);
  });

  it("typy bez ani jednej rekomendacji mają pierwszeństwo", async () => {
    // nowo włączony obiekt nie może czekać, aż cron obsłuży wszystkich,
    // którzy już mają ceny
    const sorted = byStalestFirst([t(1, "2026-07-28T10:00:00Z"), t(2), t(3, "2026-07-20T10:00:00Z")]);

    expect(sorted[0].id).toBe(2);
  });

  it("nie modyfikuje wejścia", async () => {
    const input = [t(1, "2026-07-30T10:00:00Z"), t(2, "2026-07-28T10:00:00Z")];

    byStalestFirst(input);

    expect(input.map((x) => x.id)).toEqual([1, 2]);
  });
});

describe("refreshAllRates", () => {
  it("odbudowuje horyzont 180 dni dla obiektów w trybie SmartRate", async () => {
    smartRateTypes = [{ id: 7, dynamicRates: [] }, { id: 8, dynamicRates: [] }];

    const result = await refreshAllRates();

    expect(refreshCalls).toEqual([
      { unitTypeId: 7, from: "2026-07-29", to: "2027-01-25" },
      { unitTypeId: 8, from: "2026-07-29", to: "2027-01-25" },
    ]);
    expect(result).toMatchObject({ unitTypes: 2, pending: 0 });
  });

  it("pobiera tylko typy obiektów w trybie SmartRate", async () => {
    // obiekt na regułach nie ma po co odpytywać płatnego silnika
    smartRateTypes = [{ id: 7, dynamicRates: [] }];

    await refreshAllRates();

    expect(JSON.stringify(typeQueries[0])).toContain("SMARTRATE");
  });

  it("zaczyna od najdawniej odświeżanych", async () => {
    smartRateTypes = [
      { id: 7, dynamicRates: [{ fetchedAt: new Date("2026-07-30T10:00:00Z") }] },
      { id: 8, dynamicRates: [{ fetchedAt: new Date("2026-07-20T10:00:00Z") }] },
    ];

    await refreshAllRates();

    expect(refreshCalls.map((c) => c.unitTypeId)).toEqual([8, 7]);
  });

  it("przerywa po wyczerpaniu budżetu czasu i raportuje zaległość", async () => {
    // cron ma limit czasu funkcji; bez budżetu wpadał w timeout i cicho
    // gubił ogon listy, a kolejny przebieg zaczynał od tego samego początku
    smartRateTypes = [
      { id: 7, dynamicRates: [] },
      { id: 8, dynamicRates: [] },
      { id: 9, dynamicRates: [] },
    ];
    // każde odświeżenie „zajmuje" 100 ms zegara testowego
    refreshTakesMs = 100;

    const result = await refreshAllRates(150);

    expect(refreshCalls).toHaveLength(2); // trzeci już poza budżetem
    expect(result).toMatchObject({ unitTypes: 2, pending: 1 });
  });

  it("sumuje liczbę zapisanych dób", async () => {
    smartRateTypes = [{ id: 7, dynamicRates: [] }, { id: 8, dynamicRates: [] }];
    refreshReturns = [30, 12];

    expect((await refreshAllRates()).days).toBe(42);
  });

  it("brak obiektów w trybie SmartRate to zero roboty", async () => {
    smartRateTypes = [];

    expect(await refreshAllRates()).toEqual({ days: 0, unitTypes: 0, pending: 0 });
  });
});
