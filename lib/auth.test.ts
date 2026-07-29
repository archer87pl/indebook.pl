import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Sesje właściciela i superadmina: ciasteczko, wygasanie, bramki dostępu.
// Cały moduł chodzi po ciasteczkach Next i bazie, więc podstawiamy oba —
// testujemy reguły, nie Prismę.

type SessionRow = {
  token: string;
  expiresAt: Date;
  user: {
    id: number;
    isAdmin: boolean;
    property: { id: number; slug: string } | null;
  };
};

const sessions = new Map<string, SessionRow>();
const created: { token: string; userId: number; expiresAt: Date }[] = [];
const deletedTokens: string[] = [];

const cookieJar = new Map<string, { value: string; options: Record<string, unknown> }>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const entry = cookieJar.get(name);
      return entry ? { name, value: entry.value } : undefined;
    },
    set: (name: string, value: string, options: Record<string, unknown>) => {
      cookieJar.set(name, { value, options });
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

/** redirect() w Next rzuca — atrapa robi to samo, żeby dało się złapać cel. */
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

// react cache() memoizuje per żądanie; w teście wystarczy przezroczyste opakowanie
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

vi.mock("./db", () => ({
  prisma: {
    session: {
      create: async ({ data }: { data: { token: string; userId: number; expiresAt: Date } }) => {
        created.push(data);
      },
      findUnique: async ({ where }: { where: { token: string } }) =>
        sessions.get(where.token) ?? null,
      deleteMany: async ({ where }: { where: { token: string } }) => {
        deletedTokens.push(where.token);
        sessions.delete(where.token);
      },
    },
  },
}));

const { SESSION_COOKIE, createSession, destroySession, getSessionUser, requireOwner, requireSuperadmin } =
  await import("./auth");

const NOW = new Date("2026-07-29T12:00:00Z");

beforeEach(() => {
  sessions.clear();
  created.length = 0;
  deletedTokens.length = 0;
  cookieJar.clear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function seedSession(token: string, overrides: Partial<SessionRow> = {}): void {
  sessions.set(token, {
    token,
    expiresAt: new Date(NOW.getTime() + 3600_000),
    user: { id: 7, isAdmin: false, property: { id: 3, slug: "willa" } },
    ...overrides,
  });
  cookieJar.set(SESSION_COOKIE, { value: token, options: {} });
}

describe("createSession", () => {
  it("zapisuje sesję na 30 dni i wydaje ciasteczko niedostępne dla skryptów", async () => {
    await createSession(42);

    expect(created).toHaveLength(1);
    expect(created[0].userId).toBe(42);
    const days = (created[0].expiresAt.getTime() - NOW.getTime()) / 86_400_000;
    expect(days).toBe(30);

    const cookie = cookieJar.get(SESSION_COOKIE)!;
    expect(cookie.value).toBe(created[0].token);
    // httpOnly odcina kradzież tokenu przez XSS, sameSite=lax — przez CSRF
    expect(cookie.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(cookie.options.maxAge).toBe(30 * 24 * 3600);
  });

  it("token jest losowy i dostatecznie długi", async () => {
    await createSession(1);
    await createSession(1);

    expect(created[0].token).not.toBe(created[1].token);
    expect(created[0].token).toMatch(/^[0-9a-f]{64}$/); // 32 bajty entropii
  });

  it("na produkcji ciasteczko wychodzi wyłącznie po HTTPS", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await createSession(1);
    expect(cookieJar.get(SESSION_COOKIE)!.options.secure).toBe(true);
  });

  it("lokalnie flaga secure jest zdjęta, inaczej nie dałoby się zalogować po http", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await createSession(1);
    expect(cookieJar.get(SESSION_COOKIE)!.options.secure).toBe(false);
  });
});

describe("destroySession", () => {
  it("kasuje sesję w bazie i zdejmuje ciasteczko", async () => {
    seedSession("abc");

    await destroySession();

    expect(deletedTokens).toEqual(["abc"]);
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
  });

  it("bez ciasteczka nie rusza bazy", async () => {
    await destroySession();
    expect(deletedTokens).toEqual([]);
  });
});

describe("getSessionUser", () => {
  it("bez ciasteczka nie ma użytkownika", async () => {
    expect(await getSessionUser()).toBeNull();
  });

  it("token nieznany bazie nie loguje nikogo", async () => {
    cookieJar.set(SESSION_COOKIE, { value: "podrobiony", options: {} });
    expect(await getSessionUser()).toBeNull();
  });

  it("sesja wygasła jest odrzucana, choć wciąż jest w bazie", async () => {
    seedSession("stara", { expiresAt: new Date(NOW.getTime() - 1000) });
    expect(await getSessionUser()).toBeNull();
  });

  it("ważna sesja oddaje użytkownika razem z obiektem", async () => {
    seedSession("ok");
    const user = await getSessionUser();
    expect(user).toMatchObject({ id: 7, property: { slug: "willa" } });
  });
});

describe("requireOwner", () => {
  it("niezalogowany trafia na logowanie", async () => {
    await expect(requireOwner()).rejects.toThrow("REDIRECT /login");
  });

  it("właściciel z obiektem przechodzi dalej", async () => {
    seedSession("ok");
    const { user, property } = await requireOwner();
    expect(user.id).toBe(7);
    expect(property.slug).toBe("willa");
  });

  it("konto bez obiektu idzie dokończyć rejestrację", async () => {
    seedSession("bez-obiektu", {
      user: { id: 8, isAdmin: false, property: null },
    });
    await expect(requireOwner()).rejects.toThrow("REDIRECT /rejestracja");
  });

  it("superadmin bez obiektu wraca do panelu platformy, a nie do rejestracji", async () => {
    seedSession("admin", { user: { id: 1, isAdmin: true, property: null } });
    await expect(requireOwner()).rejects.toThrow("REDIRECT /superadmin");
  });
});

describe("requireSuperadmin", () => {
  it("zwykły właściciel nie wchodzi", async () => {
    seedSession("ok"); // isAdmin: false
    await expect(requireSuperadmin()).rejects.toThrow("REDIRECT /login");
  });

  it("niezalogowany nie wchodzi", async () => {
    await expect(requireSuperadmin()).rejects.toThrow("REDIRECT /login");
  });

  it("administrator platformy przechodzi", async () => {
    seedSession("admin", { user: { id: 1, isAdmin: true, property: null } });
    expect((await requireSuperadmin()).id).toBe(1);
  });
});
