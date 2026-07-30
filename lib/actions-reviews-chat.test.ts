import { beforeEach, describe, expect, it, vi } from "vitest";

// Opinie i czat gość↔recepcja. Opinia trafia na publiczną stronę obiektu, więc
// podpis autora jest minimalizowany (imię + inicjał), można ją wystawić tylko
// po zakończonym pobycie i dokładnie raz. Czat w obie strony ma limit długości
// i powiadamia drugą stronę, o ile jej adres jest prawdziwy.

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
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: (cb: () => unknown) => void cb() }));
vi.mock("next-intl/server", () => ({
  getLocale: async () => "pl",
  getTranslations: async () => (k: string) => k,
}));

const owner = { user: { id: 5 }, property: { id: 3, name: "Willa Pod Dębem" } };
vi.mock("./auth", () => ({
  requireOwner: async () => owner,
  requireSuperadmin: async () => ({ id: 1 }),
  getSessionUser: async () => owner.user,
  createSession: async () => {},
  destroySession: async () => {},
  SESSION_COOKIE: "rezflow_session",
}));

type Reservation = {
  id: number;
  code: string;
  status: string;
  checkIn: string;
  checkOut: string;
  guestName: string;
  email: string;
  review: { id: number } | null;
  unit: {
    unitType: {
      propertyId: number;
      property: { id: number; slug: string; name: string; owner: { email: string } };
    };
  };
};

let reservation: Reservation | null = null;
let review: { id: number; propertyId: number; hidden: boolean } | null = null;

const reviewsCreated: Record<string, unknown>[] = [];
const reviewUpdates: { id: number; data: Record<string, unknown> }[] = [];
const messagesCreated: Record<string, unknown>[] = [];
const mails: { to: string; subject: string; body: string }[] = [];

vi.mock("./db", () => ({
  prisma: {
    reservation: { findUnique: async () => reservation },
    review: {
      findUnique: async () => review,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        reviewsCreated.push(data);
      },
      update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
        reviewUpdates.push({ id: where.id, data });
      },
    },
    message: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        messagesCreated.push(data);
      },
    },
    property: { findUnique: async () => null },
  },
}));

vi.mock("./mailer", () => ({
  sendMail: async (m: { to: string; subject: string; body: string }) => void mails.push(m),
}));
vi.mock("./sms", () => ({ sendSms: async () => {} }));
vi.mock("./log", () => ({ logEvent: async () => {} }));
vi.mock("./rate-limit", () => ({ rateLimitOrRedirect: async () => {}, rateLimit: async () => true }));
vi.mock("./channex/enqueue-helpers", () => ({ afterAri: async () => {}, syncUnitRange: async () => {} }));
vi.mock("./ical", () => ({ syncIcalFeed: async () => ({ ok: true, imported: 0 }) }));
vi.mock("./photos", () => ({ savePhotoFile: async () => "", deletePhotoFile: async () => {} }));

const {
  replyToReview,
  sendGuestMessage,
  sendOwnerMessage,
  submitReview,
  toggleReviewHidden,
} = await import("./actions");
const { REVIEW_MAX } = await import("./reviews");

const form = (entries: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};

async function target(run: Promise<void>): Promise<string> {
  try {
    await run;
    throw new Error("akcja nie przekierowała");
  } catch (e) {
    if (e instanceof RedirectError) return decodeURIComponent(e.to);
    throw e;
  }
}

beforeEach(() => {
  reservation = {
    id: 55,
    code: "HO-ABC123",
    status: "CONFIRMED",
    checkIn: "2026-07-20",
    checkOut: "2026-07-25", // pobyt zakończony
    guestName: "Anna Kowalska",
    email: "anna@example.com",
    review: null,
    unit: {
      unitType: {
        propertyId: 3,
        property: {
          id: 3,
          slug: "willa-pod-debem",
          name: "Willa Pod Dębem",
          owner: { email: "wlasciciel@example.com" },
        },
      },
    },
  };
  review = { id: 11, propertyId: 3, hidden: false };
  reviewsCreated.length = 0;
  reviewUpdates.length = 0;
  messagesCreated.length = 0;
  mails.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 30, 12, 0, 0));
});

describe("submitReview", () => {
  const VALID = { code: "HO-ABC123", rating: "5", comment: "Świetny pobyt!", consent: "on" };

  it("zapisuje opinię i powiadamia właściciela", async () => {
    expect(await target(submitReview(form(VALID)))).toBe("/r/HO-ABC123?reviewed=1");

    expect(reviewsCreated[0]).toMatchObject({
      reservationId: 55,
      propertyId: 3,
      rating: 5,
      comment: "Świetny pobyt!",
    });
    expect(mails[0].to).toBe("wlasciciel@example.com");
  });

  it("publiczny podpis to imię i inicjał, nie pełne nazwisko", async () => {
    // opinia jest widoczna dla każdego — pełne nazwisko byłoby nadmiarem
    await target(submitReview(form(VALID)));

    expect(reviewsCreated[0]).toMatchObject({ authorName: "Anna K." });
  });

  it("opinia bez komentarza jest dozwolona — ocena wystarcza", async () => {
    await target(submitReview(form({ ...VALID, comment: "" })));

    expect(reviewsCreated[0]).toMatchObject({ rating: 5, comment: "" });
  });

  it("ocena musi być liczbą całkowitą z zakresu 1–5", async () => {
    for (const rating of ["0", "6", "4.5", "abc", ""]) {
      const to = await target(submitReview(form({ ...VALID, rating })));
      expect(to, `rating=${rating}`).toContain("ratingRequired");
    }
    expect(reviewsCreated).toEqual([]);
  });

  it("komentarz dłuższy niż limit jest odrzucany z podaniem limitu", async () => {
    const to = await target(
      submitReview(form({ ...VALID, comment: "x".repeat(REVIEW_MAX + 1) }))
    );

    expect(to).toContain("reviewTooLong");
    expect(to).toContain(String(REVIEW_MAX));
    expect(reviewsCreated).toEqual([]);
  });

  it("komentarz dokładnie na limicie przechodzi", async () => {
    await target(submitReview(form({ ...VALID, comment: "x".repeat(REVIEW_MAX) })));

    expect(reviewsCreated).toHaveLength(1);
  });

  it("bez zgody na publikację opinia nie powstaje", async () => {
    expect(await target(submitReview(form({ ...VALID, consent: "" })))).toContain(
      "reviewConsentRequired"
    );
    expect(reviewsCreated).toEqual([]);
  });

  it("druga opinia do tej samej rezerwacji nie przechodzi", async () => {
    reservation!.review = { id: 9 };

    const to = await target(submitReview(form(VALID)));

    expect(to).toContain("reviewDone");
    expect(reviewsCreated).toEqual([]);
  });

  it("przed zakończeniem pobytu nie da się wystawić opinii", async () => {
    // inaczej ocenę wystawiałby ktoś, kto jeszcze nie był na miejscu
    reservation!.checkOut = "2026-08-15";

    const to = await target(submitReview(form(VALID)));

    expect(to).toContain("reviewTooEarly");
    expect(reviewsCreated).toEqual([]);
  });

  it("rezerwacja nieopłacona nie daje prawa do opinii", async () => {
    reservation!.status = "PENDING";

    expect(await target(submitReview(form(VALID)))).toContain("reviewTooEarly");
  });

  it("właściciel z adresem zastępczym nie dostaje maila", async () => {
    reservation!.unit.unitType.property.owner.email = "recepcja-3@rezflow.local";

    await target(submitReview(form(VALID)));

    expect(reviewsCreated).toHaveLength(1);
    expect(mails).toEqual([]);
  });

  it("nieznany kod rezerwacji odsyła na stronę główną", async () => {
    reservation = null;
    expect(await target(submitReview(form(VALID)))).toBe("/");
  });
});

describe("toggleReviewHidden (panel obiektu)", () => {
  it("ukrywa i przywraca opinię własnego obiektu", async () => {
    await target(toggleReviewHidden(form({ id: "11" })));
    expect(reviewUpdates).toEqual([{ id: 11, data: { hidden: true } }]);

    reviewUpdates.length = 0;
    review!.hidden = true;
    await target(toggleReviewHidden(form({ id: "11" })));
    expect(reviewUpdates).toEqual([{ id: 11, data: { hidden: false } }]);
  });

  it("opinia z cudzego obiektu jest nietykalna", async () => {
    // moderacja globalna jest zastrzeżona dla panelu platformy
    review!.propertyId = 999;

    await target(toggleReviewHidden(form({ id: "11" })));

    expect(reviewUpdates).toEqual([]);
  });

  it("nieistniejąca opinia nie wywraca akcji", async () => {
    review = null;

    expect(await target(toggleReviewHidden(form({ id: "999" })))).toBe("/admin/opinie");
    expect(reviewUpdates).toEqual([]);
  });
});

describe("replyToReview", () => {
  it("zapisuje publiczną odpowiedź właściciela", async () => {
    await target(replyToReview(form({ id: "11", reply: "Dziękujemy za opinię!" })));

    expect(reviewUpdates).toEqual([{ id: 11, data: { ownerReply: "Dziękujemy za opinię!" } }]);
  });

  it("odpowiedź jest przycinana do limitu, a nie odrzucana", async () => {
    // właściciel nie traci długiego tekstu — zapisujemy tyle, ile wchodzi
    await target(replyToReview(form({ id: "11", reply: "x".repeat(REVIEW_MAX + 500) })));

    expect(String(reviewUpdates[0].data.ownerReply)).toHaveLength(REVIEW_MAX);
  });

  it("pusta odpowiedź kasuje poprzednią", async () => {
    await target(replyToReview(form({ id: "11", reply: "" })));

    expect(reviewUpdates).toEqual([{ id: 11, data: { ownerReply: "" } }]);
  });

  it("opinia z cudzego obiektu nie da się skomentować", async () => {
    review!.propertyId = 999;

    await target(replyToReview(form({ id: "11", reply: "Cokolwiek" })));

    expect(reviewUpdates).toEqual([]);
  });
});

describe("sendGuestMessage", () => {
  it("zapisuje wiadomość gościa i powiadamia właściciela", async () => {
    const to = await target(
      sendGuestMessage(form({ code: "HO-ABC123", body: "O której można się zameldować?" }))
    );

    expect(to).toBe("/r/HO-ABC123#czat");
    expect(messagesCreated[0]).toMatchObject({
      reservationId: 55,
      sender: "GUEST",
      body: "O której można się zameldować?",
    });
    expect(mails[0].to).toBe("wlasciciel@example.com");
    expect(mails[0].body).toContain("O której można się zameldować?");
  });

  it("pusta wiadomość i przekraczająca limit są odrzucane", async () => {
    for (const body of ["", "   ", "x".repeat(2001)]) {
      const to = await target(sendGuestMessage(form({ code: "HO-ABC123", body })));
      expect(to).toContain("od 1 do 2000");
    }
    expect(messagesCreated).toEqual([]);
  });

  it("wiadomość dokładnie na limicie przechodzi", async () => {
    await target(sendGuestMessage(form({ code: "HO-ABC123", body: "x".repeat(2000) })));

    expect(messagesCreated).toHaveLength(1);
  });

  it("właściciel z adresem zastępczym nie dostaje maila, ale wiadomość zostaje", async () => {
    // recepcja i tak zobaczy ją w panelu
    reservation!.unit.unitType.property.owner.email = "recepcja-3@rezflow.local";

    await target(sendGuestMessage(form({ code: "HO-ABC123", body: "Pytanie" })));

    expect(messagesCreated).toHaveLength(1);
    expect(mails).toEqual([]);
  });

  it("nieznany kod rezerwacji odsyła na stronę główną", async () => {
    reservation = null;
    expect(await target(sendGuestMessage(form({ code: "HO-X", body: "Cześć" })))).toBe("/");
  });
});

describe("sendOwnerMessage", () => {
  it("zapisuje odpowiedź recepcji i powiadamia gościa", async () => {
    const to = await target(sendOwnerMessage(form({ id: "55", body: "Od 15:00." })));

    expect(to).toBe("/admin/rezerwacje/55#czat");
    expect(messagesCreated[0]).toMatchObject({ reservationId: 55, sender: "OWNER", body: "Od 15:00." });
    expect(mails[0].to).toBe("anna@example.com");
    expect(mails[0].subject).toContain("Willa Pod Dębem");
  });

  it("pusta wiadomość i przekraczająca limit są odrzucane", async () => {
    expect(await target(sendOwnerMessage(form({ id: "55", body: "" })))).toContain("od 1 do 2000");
    expect(
      await target(sendOwnerMessage(form({ id: "55", body: "x".repeat(2001) })))
    ).toContain("od 1 do 2000");
    expect(messagesCreated).toEqual([]);
  });

  it("gość z adresem zastępczym nie dostaje maila, ale wiadomość zostaje", async () => {
    reservation!.email = "brak@rezflow.local";

    await target(sendOwnerMessage(form({ id: "55", body: "Do zobaczenia" })));

    expect(messagesCreated).toHaveLength(1);
    expect(mails).toEqual([]);
  });

  it("rezerwacja z cudzego obiektu nie da się skomentować", async () => {
    reservation!.unit.unitType.propertyId = 999;

    expect(await target(sendOwnerMessage(form({ id: "55", body: "Cokolwiek" })))).toBe(
      "/admin/rezerwacje"
    );
    expect(messagesCreated).toEqual([]);
  });
});
