import { beforeEach, describe, expect, it, vi } from "vitest";

// Rejestracja, logowanie i reset hasła. Wszystkie trzy są publiczne i wszystkie
// trzy muszą milczeć o tym, które konta istnieją: logowanie liczy hash także
// dla nieistniejącego e-maila (żeby czas odpowiedzi nie zdradzał konta),
// a reset hasła zawsze kończy się tym samym komunikatem.

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

type User = {
  id: number;
  email: string;
  name: string;
  passwordHash: string;
  isAdmin: boolean;
};

let user: User | null = null;
let resetToken: { token: string; userId: number; expiresAt: Date } | null = null;
let rateLimited: string | null = null;

const createdUsers: Record<string, unknown>[] = [];
const userUpdates: Record<string, unknown>[] = [];
const tokensCreated: Record<string, unknown>[] = [];
const tokensDeleted: Record<string, unknown>[] = [];
const sessionsDeleted: Record<string, unknown>[] = [];
const sessionsCreated: number[] = [];
const mails: { to: string; subject: string; body: string }[] = [];
const events: { kind: string; level?: string; message: string; meta?: string }[] = [];
const passwordChecks: { password: string; hash: string }[] = [];

vi.mock("./db", () => ({
  prisma: {
    user: {
      findUnique: async () => user,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdUsers.push(data);
        return { id: 77, ...data };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        userUpdates.push(data);
      },
    },
    passwordResetToken: {
      findUnique: async () => resetToken,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        tokensCreated.push(data);
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        tokensDeleted.push(where);
        return { count: 0 };
      },
    },
    session: {
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        sessionsDeleted.push(where);
        return { count: 0 };
      },
    },
    property: { findUnique: async () => null },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

vi.mock("./auth", () => ({
  createSession: async (userId: number) => {
    sessionsCreated.push(userId);
  },
  destroySession: async () => {},
  requireOwner: async () => ({ user: { id: 5 }, property: { id: 3 } }),
  requireSuperadmin: async () => ({ id: 1 }),
  getSessionUser: async () => null,
  SESSION_COOKIE: "rezflow_session",
}));

vi.mock("./password", async (importOriginal) => {
  const original = await importOriginal<typeof import("./password")>();
  return {
    ...original,
    verifyPassword: (password: string, hash: string) => {
      passwordChecks.push({ password, hash });
      return original.verifyPassword(password, hash);
    },
  };
});

vi.mock("./slug", () => ({
  slugify: (s: string) => s.toLowerCase().replace(/\s+/g, "-"),
  uniquePropertySlug: async (name: string) => `${name.toLowerCase().replace(/\s+/g, "-")}-1`,
}));

vi.mock("./mailer", () => ({
  sendMail: async (m: { to: string; subject: string; body: string }) => void mails.push(m),
}));
vi.mock("./sms", () => ({ sendSms: async () => {} }));
vi.mock("./log", () => ({
  logEvent: async (e: (typeof events)[number]) => void events.push(e),
}));
vi.mock("./rate-limit", () => ({
  rateLimitOrRedirect: async (action: string, _l: number, _w: number, redirectTo: string) => {
    if (rateLimited === action) throw new RedirectError(redirectTo);
  },
  rateLimit: async () => true,
}));
vi.mock("./channex/enqueue-helpers", () => ({ afterAri: async () => {}, syncUnitRange: async () => {} }));
vi.mock("./ical", () => ({ syncIcalFeed: async () => ({ ok: true, imported: 0 }) }));
vi.mock("./photos", () => ({ savePhotoFile: async () => "", deletePhotoFile: async () => {} }));

const { login, register, requestPasswordReset, resetPassword } = await import("./actions");
const { hashPassword, DUMMY_PASSWORD_HASH } = await import("./password");

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
  user = null;
  resetToken = null;
  rateLimited = null;
  createdUsers.length = 0;
  userUpdates.length = 0;
  tokensCreated.length = 0;
  tokensDeleted.length = 0;
  sessionsDeleted.length = 0;
  sessionsCreated.length = 0;
  mails.length = 0;
  events.length = 0;
  passwordChecks.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

describe("register", () => {
  const VALID = {
    name: "Anna Kowalska",
    email: "Anna@Example.COM",
    password: "tajnehaslo1",
    propertyName: "Willa Pod Dębem",
  };

  it("zakłada konto z obiektem i od razu loguje", async () => {
    expect(await target(register(form(VALID)))).toBe("/admin");

    expect(createdUsers[0]).toMatchObject({
      email: "anna@example.com", // adres schodzi do małych liter
      name: "Anna Kowalska",
    });
    expect(sessionsCreated).toEqual([77]);
  });

  it("zakładanie kont jest limitowane", async () => {
    // każda rejestracja tworzy konto ORAZ obiekt (zajmuje slug) — bez limitu
    // jeden skrypt zapełnia bazę; 5 prób na godzinę z jednego adresu
    rateLimited = "register";

    const to = await target(register(form(VALID)));

    expect(to).toContain("Za dużo prób rejestracji");
    expect(createdUsers).toEqual([]);
  });

  it("limit nie kasuje tego, co gość zdążył wpisać", async () => {
    // po odbiciu formularz ma się wypełnić z powrotem, jak przy innych błędach
    rateLimited = "register";

    const to = await target(register(form(VALID)));

    expect(to).toContain("propertyName=Willa");
  });

  it("hasło nigdy nie ląduje w bazie jawnie", async () => {
    await target(register(form(VALID)));

    const hash = String(createdUsers[0].passwordHash);
    expect(hash).not.toContain("tajnehaslo1");
    expect(hash.length).toBeGreaterThan(20);
  });

  it("obiekt powstaje razem z kontem, z unikalnym adresem", async () => {
    // konto bez obiektu utknęłoby w połowie rejestracji
    await target(register(form(VALID)));

    expect(createdUsers[0].property).toMatchObject({
      create: { name: "Willa Pod Dębem", slug: "willa-pod-dębem-1" },
    });
  });

  it("zajęty e-mail nie zakłada drugiego konta", async () => {
    user = {
      id: 1,
      email: "anna@example.com",
      name: "Anna",
      passwordHash: "x",
      isAdmin: false,
    };

    const to = await target(register(form(VALID)));

    expect(to).toContain("już istnieje");
    expect(createdUsers).toEqual([]);
    expect(sessionsCreated).toEqual([]);
  });

  it("odrzuca niekompletne dane i nie gubi tego, co gość zdążył wpisać", async () => {
    const cases: [Partial<typeof VALID>, string][] = [
      [{ name: "Ab" }, "imię i nazwisko"],
      [{ email: "anna@" }, "adres e-mail"],
      [{ password: "krotkie" }, "8 znaków"],
      [{ propertyName: "Ab" }, "nazwę obiektu"],
    ];

    for (const [override, expected] of cases) {
      const to = await target(register(form({ ...VALID, ...override })));
      expect(to, JSON.stringify(override)).toContain(expected);
      // formularz wraca wypełniony — inaczej trzeba by wpisywać wszystko od nowa
      expect(to).toContain("propertyName=");
    }
    expect(createdUsers).toEqual([]);
  });
});

describe("login", () => {
  const PASSWORD = "tajnehaslo1";

  beforeEach(() => {
    user = {
      id: 42,
      email: "anna@example.com",
      name: "Anna",
      passwordHash: hashPassword(PASSWORD),
      isAdmin: false,
    };
  });

  it("poprawne dane logują właściciela do panelu", async () => {
    expect(
      await target(login(form({ email: "Anna@Example.com", password: PASSWORD })))
    ).toBe("/admin");

    expect(sessionsCreated).toEqual([42]);
  });

  it("administrator platformy trafia do panelu platformy", async () => {
    user!.isAdmin = true;

    expect(await target(login(form({ email: "a@example.com", password: PASSWORD })))).toBe(
      "/superadmin"
    );
  });

  it("złe hasło nie loguje i zostawia ostrzeżenie w dzienniku", async () => {
    const to = await target(login(form({ email: "anna@example.com", password: "zle" })));

    expect(to).toBe("/login?error=1");
    expect(sessionsCreated).toEqual([]);
    expect(events[0]).toMatchObject({ kind: "AUTH", level: "WARN" });
  });

  it("nieistniejące konto i złe hasło dają identyczną odpowiedź", async () => {
    const wrongPassword = await target(
      login(form({ email: "anna@example.com", password: "zle" }))
    );
    user = null;
    const noAccount = await target(
      login(form({ email: "nie-ma@example.com", password: PASSWORD }))
    );

    expect(noAccount).toBe(wrongPassword);
  });

  it("hash liczy się także dla nieistniejącego konta", async () => {
    // bez tego czas odpowiedzi zdradzałby, które adresy są zarejestrowane
    user = null;

    await target(login(form({ email: "nie-ma@example.com", password: PASSWORD })));

    expect(passwordChecks).toHaveLength(1);
    expect(passwordChecks[0].hash).toBe(DUMMY_PASSWORD_HASH);
  });

  it("zgadywanie haseł jest limitowane", async () => {
    // 10 prób na 10 minut z jednego adresu
    rateLimited = "login";

    expect(await target(login(form({ email: "a@example.com", password: "x" })))).toBe(
      "/login?error=rate"
    );
    expect(passwordChecks).toEqual([]);
  });
});

describe("requestPasswordReset", () => {
  beforeEach(() => {
    user = {
      id: 42,
      email: "anna@example.com",
      name: "Anna",
      passwordHash: "x",
      isAdmin: false,
    };
  });

  it("wysyła jednorazowy link ważny godzinę", async () => {
    await target(requestPasswordReset(form({ email: "anna@example.com" })));

    expect(tokensCreated).toHaveLength(1);
    const created = tokensCreated[0] as { token: string; expiresAt: Date };
    expect(created.token).toMatch(/^[0-9a-f]{64}$/);
    expect(created.expiresAt.getTime() - NOW.getTime()).toBe(3600_000);
    expect(mails[0].to).toBe("anna@example.com");
    expect(mails[0].body).toContain(created.token);
  });

  it("unieważnia wcześniejsze linki tego konta", async () => {
    // stary link z cudzej skrzynki nie może dalej działać
    await target(requestPasswordReset(form({ email: "anna@example.com" })));

    expect(tokensDeleted).toEqual([{ userId: 42 }]);
  });

  it("nieznany adres kończy się tak samo, ale bez maila", async () => {
    // różna odpowiedź pozwalałaby sprawdzić, czy ktoś ma tu konto
    user = null;

    const to = await target(requestPasswordReset(form({ email: "nie-ma@example.com" })));

    expect(to).toBe("/zapomniane-haslo?sent=1");
    expect(mails).toEqual([]);
    expect(tokensCreated).toEqual([]);
  });

  it("zalew żądań resetu jest limitowany, też bez zdradzania konta", async () => {
    rateLimited = "reset";

    expect(await target(requestPasswordReset(form({ email: "anna@example.com" })))).toBe(
      "/zapomniane-haslo?sent=1"
    );
    expect(mails).toEqual([]);
  });
});

describe("resetPassword", () => {
  beforeEach(() => {
    resetToken = {
      token: "wazny-token",
      userId: 42,
      expiresAt: new Date(NOW.getTime() + 600_000),
    };
  });

  it("ustawia nowe hasło i wylogowuje ze wszystkich urządzeń", async () => {
    // reset zwykle oznacza podejrzenie przejęcia konta — cudze sesje muszą paść
    expect(
      await target(resetPassword(form({ token: "wazny-token", password: "noweHaslo123" })))
    ).toBe("/login?reset=1");

    expect(String(userUpdates[0].passwordHash)).not.toContain("noweHaslo123");
    expect(sessionsDeleted).toEqual([{ userId: 42 }]);
  });

  it("zużywa token, żeby nie dał się użyć drugi raz", async () => {
    await target(resetPassword(form({ token: "wazny-token", password: "noweHaslo123" })));

    expect(tokensDeleted).toEqual([{ userId: 42 }]);
  });

  it("token wygasły nie zmienia hasła", async () => {
    resetToken!.expiresAt = new Date(NOW.getTime() - 1000);

    expect(
      await target(resetPassword(form({ token: "stary-token", password: "noweHaslo123" })))
    ).toBe("/zapomniane-haslo?expired=1");
    expect(userUpdates).toEqual([]);
  });

  it("nieznany token nie zmienia hasła", async () => {
    resetToken = null;

    expect(
      await target(resetPassword(form({ token: "zmyslony", password: "noweHaslo123" })))
    ).toBe("/zapomniane-haslo?expired=1");
    expect(userUpdates).toEqual([]);
  });

  it("za krótkie hasło jest odrzucane, zanim token zostanie zużyty", async () => {
    const to = await target(resetPassword(form({ token: "wazny-token", password: "krotkie" })));

    expect(to).toContain("8 znaków");
    expect(userUpdates).toEqual([]);
    expect(tokensDeleted).toEqual([]); // token nadal ważny, można spróbować ponownie
  });
});
