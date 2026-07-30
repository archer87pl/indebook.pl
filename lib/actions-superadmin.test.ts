import { beforeEach, describe, expect, it, vi } from "vitest";

// Akcje panelu platformy. Każda dotyka CUDZEGO obiektu albo konta, więc
// interesują nas dwie rzeczy: co dokładnie zmieniają i czy zostawiają ślad
// w dzienniku — bo to jedyny zapis tego, że administrator platformy wszedł
// komuś w dane. Impersonacja i kasowanie obiektu mają dodatkowe bariery.

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

const ADMIN = { id: 1, email: "admin@rezflow.pl", isAdmin: true };
const sessionsCreated: number[] = [];
let sessionsDestroyed = 0;

vi.mock("./auth", () => ({
  requireSuperadmin: async () => ADMIN,
  requireOwner: async () => ({ user: { id: 5 }, property: { id: 3 } }),
  getSessionUser: async () => ADMIN,
  createSession: async (userId: number) => {
    sessionsCreated.push(userId);
  },
  destroySession: async () => {
    sessionsDestroyed++;
  },
  SESSION_COOKIE: "rezflow_session",
}));

type Property = {
  id: number;
  name: string;
  slug: string;
  suspended: boolean;
};

let property: Property | null = null;
let slugOwner: { id: number; slug: string } | null = null;
let user: { id: number; email: string; name: string; isAdmin: boolean; property: { id: number } | null } | null =
  null;
let emailOwner: { id: number } | null = null;
let review: { id: number; hidden: boolean } | null = null;

const propertyUpdates: { id: number; data: Record<string, unknown> }[] = [];
const userUpdates: { id: number; data: Record<string, unknown> }[] = [];
const reviewUpdates: { id: number; data: Record<string, unknown> }[] = [];
const settingUpserts: { key: string; value: string }[] = [];
const settingsDeleted: Record<string, unknown>[] = [];
const tokensCreated: Record<string, unknown>[] = [];
const tokensDeleted: Record<string, unknown>[] = [];
const mails: { to: string; subject: string; body: string }[] = [];
const events: { kind: string; level?: string; message: string; propertyId?: number | null; meta?: string }[] =
  [];

/** Zapytania po slug/e-mail idą tym samym findUnique — rozróżniamy po kluczu. */
vi.mock("./db", () => ({
  prisma: {
    property: {
      findUnique: async ({ where }: { where: { id?: number; slug?: string } }) =>
        where.slug !== undefined ? slugOwner : property,
      update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
        propertyUpdates.push({ id: where.id, data });
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id?: number; email?: string } }) =>
        where.email !== undefined ? emailOwner : user,
      update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
        userUpdates.push({ id: where.id, data });
      },
    },
    review: {
      findUnique: async () => review,
      update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
        reviewUpdates.push({ id: where.id, data });
      },
    },
    platformSetting: {
      upsert: async ({ create }: { create: { key: string; value: string } }) => {
        settingUpserts.push(create);
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        settingsDeleted.push(where);
        return { count: 0 };
      },
    },
    passwordResetToken: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        tokensCreated.push(data);
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        tokensDeleted.push(where);
        return { count: 0 };
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

vi.mock("./mailer", () => ({
  sendMail: async (m: { to: string; subject: string; body: string }) => void mails.push(m),
}));
vi.mock("./sms", () => ({ sendSms: async () => {} }));
vi.mock("./log", () => ({
  logEvent: async (e: (typeof events)[number]) => void events.push(e),
}));
vi.mock("./rate-limit", () => ({ rateLimitOrRedirect: async () => {}, rateLimit: async () => true }));
vi.mock("./channex/enqueue-helpers", () => ({ afterAri: async () => {}, syncUnitRange: async () => {} }));
vi.mock("./ical", () => ({ syncIcalFeed: async () => ({ ok: true, imported: 0 }) }));
vi.mock("./photos", () => ({ savePhotoFile: async () => "", deletePhotoFile: async () => {} }));

const {
  superClearSettings,
  superImpersonate,
  superSaveSettings,
  superSendPasswordReset,
  superSendTestMail,
  superSetPlan,
  superToggleReviewHidden,
  superToggleSuspend,
  superUpdateOwner,
  superUpdateProperty,
} = await import("./actions");

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

const NOW = new Date(2026, 6, 30, 12, 0, 0);

beforeEach(() => {
  property = { id: 3, name: "Willa Pod Dębem", slug: "willa-pod-debem", suspended: false };
  slugOwner = null;
  user = {
    id: 5,
    email: "wlasciciel@example.com",
    name: "Jan Kowalski",
    isAdmin: false,
    property: { id: 3 },
  };
  emailOwner = null;
  review = { id: 11, hidden: false };
  propertyUpdates.length = 0;
  userUpdates.length = 0;
  reviewUpdates.length = 0;
  settingUpserts.length = 0;
  settingsDeleted.length = 0;
  tokensCreated.length = 0;
  tokensDeleted.length = 0;
  mails.length = 0;
  events.length = 0;
  sessionsCreated.length = 0;
  sessionsDestroyed = 0;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

describe("superSetPlan", () => {
  it("zmienia plan i notuje, kto to zrobił", async () => {
    // zmiana planu odblokowuje płatne funkcje — musi być identyfikowalna
    await target(superSetPlan(form({ propertyId: "3", plan: "PRO" })));

    expect(propertyUpdates).toEqual([{ id: 3, data: { plan: "PRO" } }]);
    expect(events[0]).toMatchObject({ kind: "ADMIN", propertyId: 3, meta: ADMIN.email });
  });

  it("przyjmuje tylko znane plany", async () => {
    for (const plan of ["ENTERPRISE", "pro", ""]) {
      await target(superSetPlan(form({ propertyId: "3", plan })));
    }
    expect(propertyUpdates).toEqual([]);
    expect(events).toEqual([]);
  });
});

describe("superUpdateProperty", () => {
  const VALID = {
    id: "3",
    name: "Willa Pod Dębem",
    slug: "willa-pod-debem",
    plan: "STANDARD",
    depositPercent: "30",
    checkInFrom: "15:00",
    checkOutTo: "11:00",
    address: "Zakopane",
    description: "Opis",
  };

  it("zapisuje dane obiektu", async () => {
    expect(await target(superUpdateProperty(form(VALID)))).toBe(
      "/superadmin/obiekt/3?saved=1"
    );

    expect(propertyUpdates[0].data).toMatchObject({
      name: "Willa Pod Dębem",
      slug: "willa-pod-debem",
      plan: "STANDARD",
      depositPercent: 30,
    });
  });

  it("adres jest normalizowany do sluga", async () => {
    // wpisany „Willa Pod Dębem" nie może wylądować w URL-u jako taki
    await target(superUpdateProperty(form({ ...VALID, slug: "Willa Pod Dębem!" })));

    expect(propertyUpdates[0].data).toMatchObject({ slug: "willa-pod-debem" });
  });

  it("zajęty adres innego obiektu jest odrzucany", async () => {
    // dwa obiekty pod tym samym /o/… przykryłyby się nawzajem
    slugOwner = { id: 99, slug: "willa-pod-debem" };

    const to = await target(superUpdateProperty(form(VALID)));

    expect(to).toContain("jest już zajęty");
    expect(propertyUpdates).toEqual([]);
  });

  it("ten sam adres na tym samym obiekcie przechodzi", async () => {
    slugOwner = { id: 3, slug: "willa-pod-debem" };

    await target(superUpdateProperty(form(VALID)));

    expect(propertyUpdates).toHaveLength(1);
  });

  it("odrzuca krótką nazwę, nieznany plan i zły format godzin", async () => {
    const cases: [Partial<typeof VALID>, string][] = [
      [{ name: "Ab" }, "za krótka"],
      [{ plan: "ENTERPRISE" }, "Nieznany plan"],
      [{ checkInFrom: "15" }, "HH:MM"],
      [{ checkOutTo: "11.00" }, "HH:MM"],
    ];

    for (const [override, expected] of cases) {
      const to = await target(superUpdateProperty(form({ ...VALID, ...override })));
      expect(to, JSON.stringify(override)).toContain(expected);
    }
    expect(propertyUpdates).toEqual([]);
  });

  it("zaliczka musi być procentem z zakresu 0–100", async () => {
    for (const depositPercent of ["-1", "101", "30.5", "abc"]) {
      const to = await target(superUpdateProperty(form({ ...VALID, depositPercent })));
      expect(to, `depositPercent=${depositPercent}`).toContain("0–100");
    }

    await target(superUpdateProperty(form({ ...VALID, depositPercent: "0" })));
    expect(propertyUpdates).toHaveLength(1); // 0% jest dozwolone
  });

  it("nieistniejący obiekt odsyła do listy", async () => {
    property = null;
    expect(await target(superUpdateProperty(form(VALID)))).toBe("/superadmin");
  });
});

describe("superToggleSuspend", () => {
  it("zawieszenie notuje się jako ostrzeżenie", async () => {
    // to odcięcie obiektu od sprzedaży — waga wpisu ma to odzwierciedlać
    await target(superToggleSuspend(form({ id: "3" })));

    expect(propertyUpdates).toEqual([{ id: 3, data: { suspended: true } }]);
    expect(events[0]).toMatchObject({ level: "WARN", propertyId: 3, meta: ADMIN.email });
    expect(events[0].message).toContain("Zawieszono");
  });

  it("przywrócenie notuje się jako zwykłe zdarzenie", async () => {
    property!.suspended = true;

    await target(superToggleSuspend(form({ id: "3" })));

    expect(propertyUpdates).toEqual([{ id: 3, data: { suspended: false } }]);
    expect(events[0]).toMatchObject({ level: "INFO" });
    expect(events[0].message).toContain("Przywrócono");
  });

  it("nieistniejący obiekt nie zostawia śladu", async () => {
    property = null;

    await target(superToggleSuspend(form({ id: "999" })));

    expect(propertyUpdates).toEqual([]);
    expect(events).toEqual([]);
  });
});

describe("superUpdateOwner", () => {
  const VALID = { propertyId: "3", userId: "5", name: "Jan Kowalski", email: "Jan@Example.COM" };

  it("zapisuje dane właściciela, adres małymi literami", async () => {
    await target(superUpdateOwner(form(VALID)));

    expect(userUpdates).toEqual([
      { id: 5, data: { name: "Jan Kowalski", email: "jan@example.com" } },
    ]);
  });

  it("adres używany przez inne konto jest odrzucany", async () => {
    // logowanie idzie po e-mailu — duplikat zabrałby dostęp jednemu z nich
    emailOwner = { id: 99 };

    const to = await target(superUpdateOwner(form(VALID)));

    expect(to).toContain("już używa tego adresu");
    expect(userUpdates).toEqual([]);
  });

  it("ten sam adres na tym samym koncie przechodzi", async () => {
    emailOwner = { id: 5 };

    await target(superUpdateOwner(form(VALID)));

    expect(userUpdates).toHaveLength(1);
  });

  it("odrzuca krótkie imię i niepoprawny e-mail", async () => {
    expect(await target(superUpdateOwner(form({ ...VALID, name: "Ab" })))).toContain(
      "imię i nazwisko"
    );
    expect(await target(superUpdateOwner(form({ ...VALID, email: "jan@" })))).toContain(
      "adres e-mail"
    );
    expect(userUpdates).toEqual([]);
  });
});

describe("superSendPasswordReset", () => {
  it("wysyła właścicielowi link ważny godzinę i unieważnia poprzednie", async () => {
    await target(superSendPasswordReset(form({ propertyId: "3", userId: "5" })));

    expect(tokensDeleted).toEqual([{ userId: 5 }]);
    const created = tokensCreated[0] as { token: string; expiresAt: Date };
    expect(created.token).toMatch(/^[0-9a-f]{64}$/);
    expect(created.expiresAt.getTime() - NOW.getTime()).toBe(3600_000);
    expect(mails[0].to).toBe("wlasciciel@example.com");
    expect(mails[0].body).toContain(created.token);
  });

  it("nieistniejące konto nie generuje tokenu ani maila", async () => {
    user = null;

    expect(await target(superSendPasswordReset(form({ propertyId: "3", userId: "999" })))).toBe(
      "/superadmin/obiekt/3?reset=1"
    );
    expect(tokensCreated).toEqual([]);
    expect(mails).toEqual([]);
  });
});

describe("superImpersonate", () => {
  it("zamienia sesję administratora na sesję właściciela i notuje to", async () => {
    // to najmocniejsze uprawnienie w systemie — wpis w dzienniku jest jedynym
    // dowodem, że ktoś wszedł na konto klienta
    expect(await target(superImpersonate(form({ userId: "5" })))).toBe("/admin");

    expect(sessionsDestroyed).toBe(1);
    expect(sessionsCreated).toEqual([5]);
    expect(events[0]).toMatchObject({ kind: "ADMIN", level: "WARN", propertyId: 3 });
    expect(events[0].message).toContain(ADMIN.email);
    expect(events[0].message).toContain("wlasciciel@example.com");
  });

  it("stara sesja pada przed założeniem nowej", async () => {
    await target(superImpersonate(form({ userId: "5" })));

    // gdyby kolejność była odwrotna, ciasteczko administratora mogłoby
    // przeżyć obok sesji właściciela
    expect(sessionsDestroyed).toBe(1);
    expect(sessionsCreated).toEqual([5]);
  });

  it("nie da się wejść na konto innego administratora", async () => {
    user!.isAdmin = true;

    expect(await target(superImpersonate(form({ userId: "1" })))).toBe("/superadmin");
    expect(sessionsCreated).toEqual([]);
    expect(sessionsDestroyed).toBe(0);
  });

  it("konto bez obiektu nie jest impersonowane", async () => {
    user!.property = null;

    expect(await target(superImpersonate(form({ userId: "5" })))).toBe("/superadmin");
    expect(sessionsCreated).toEqual([]);
  });

  it("nieistniejące konto nie jest impersonowane", async () => {
    user = null;

    expect(await target(superImpersonate(form({ userId: "999" })))).toBe("/superadmin");
    expect(sessionsCreated).toEqual([]);
  });
});

describe("superToggleReviewHidden", () => {
  it("ukrywa i przywraca opinię", async () => {
    await target(superToggleReviewHidden(form({ id: "11" })));
    expect(reviewUpdates).toEqual([{ id: 11, data: { hidden: true } }]);

    reviewUpdates.length = 0;
    review!.hidden = true;
    await target(superToggleReviewHidden(form({ id: "11" })));
    expect(reviewUpdates).toEqual([{ id: 11, data: { hidden: false } }]);
  });

  it("nieistniejąca opinia nie wywraca akcji", async () => {
    review = null;

    expect(await target(superToggleReviewHidden(form({ id: "999" })))).toBe(
      "/superadmin/opinie"
    );
    expect(reviewUpdates).toEqual([]);
  });
});

describe("superSaveSettings", () => {
  it("zapisuje wypełnione pola sekcji i notuje zmianę", async () => {
    await target(
      superSaveSettings(
        form({ section: "mail", RESEND_API_KEY: "re_nowy", EMAIL_FROM: "RezFlow <a@b.pl>" })
      )
    );

    expect(settingUpserts).toEqual([
      { key: "RESEND_API_KEY", value: "re_nowy" },
      { key: "EMAIL_FROM", value: "RezFlow <a@b.pl>" },
    ]);
    expect(events[0]).toMatchObject({ kind: "ADMIN", meta: ADMIN.email });
  });

  it("puste pole zostawia dotychczasową wartość", async () => {
    // istotne dla sekretów: formularz ich nie prefilluje, więc puste pole
    // znaczy „nie zmieniam", a nie „wyczyść"
    await target(superSaveSettings(form({ section: "mail", RESEND_API_KEY: "", EMAIL_FROM: "a@b.pl" })));

    expect(settingUpserts).toEqual([{ key: "EMAIL_FROM", value: "a@b.pl" }]);
  });

  it("zapisuje tylko pola należące do wskazanej sekcji", async () => {
    // pole z innej sekcji dorzucone do formularza nie może przejść
    await target(
      superSaveSettings(form({ section: "mail", RESEND_API_KEY: "re_x", SMSAPI_TOKEN: "token" }))
    );

    expect(settingUpserts.map((s) => s.key)).toEqual(["RESEND_API_KEY"]);
  });

  it("nieznana sekcja nie zapisuje nic", async () => {
    expect(await target(superSaveSettings(form({ section: "wymyslona", X: "1" })))).toBe(
      "/superadmin/ustawienia"
    );
    expect(settingUpserts).toEqual([]);
  });
});

describe("superClearSettings", () => {
  it("kasuje nadpisania całej sekcji i notuje powrót do ENV", async () => {
    await target(superClearSettings(form({ section: "sms" })));

    expect(settingsDeleted).toEqual([{ key: { in: ["SMSAPI_TOKEN", "SMS_FROM"] } }]);
    expect(events[0]).toMatchObject({ level: "WARN" });
    expect(events[0].message).toContain("ENV");
  });

  it("nieznana sekcja nie kasuje nic", async () => {
    await target(superClearSettings(form({ section: "wymyslona" })));

    expect(settingsDeleted).toEqual([]);
  });
});

describe("superSendTestMail", () => {
  it("wysyła próbną wiadomość na adres administratora", async () => {
    // sprawdzenie konfiguracji poczty bez angażowania gościa
    expect(await target(superSendTestMail())).toBe("/superadmin/ustawienia?testmail=1");

    expect(mails[0].to).toBe(ADMIN.email);
    expect(mails[0].subject).toContain("test");
  });
});
