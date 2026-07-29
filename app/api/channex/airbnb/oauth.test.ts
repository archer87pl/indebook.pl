import { beforeEach, describe, expect, it, vi } from "vitest";

// OAuth Airbnb przez Channex. Callback wraca z internetu z parametrem `state`,
// który jest jedynym dowodem, że to my zaczęliśmy tę autoryzację i dla którego
// obiektu — bez jego weryfikacji obcy link podłączałby cudze konto Airbnb pod
// nasz obiekt. Sam podpis state ma testy w oauth-state.test.ts; tutaj chodzi
// o to, czy trasy faktycznie z niego korzystają.

let owner = { property: { id: 3, plan: "PRO" } };
vi.mock("@/lib/auth", () => ({ requireOwner: async () => owner }));

let channexProperty: { propertyId: number; channexId: string; status: string } | null = null;
const upserts: { where: unknown; create: Record<string, unknown>; update: Record<string, unknown> }[] = [];
vi.mock("@/lib/db", () => ({
  prisma: {
    channexProperty: { findUnique: async () => channexProperty },
    channexChannel: {
      upsert: async (args: (typeof upserts)[number]) => {
        upserts.push(args);
      },
    },
  },
}));

const events: { propertyId?: number | null; message: string }[] = [];
vi.mock("@/lib/log", () => ({
  logEvent: async (e: (typeof events)[number]) => {
    events.push(e);
  },
}));

let finishResult: { channelId: string; status: string } | Error = {
  channelId: "chn-1",
  status: "active",
};
const oauthStarts: { channexId: string; redirectUrl: string }[] = [];
let provider: Record<string, unknown> | null = null;
vi.mock("@/lib/channex/provider", () => ({ channelProvider: () => provider }));

const { GET: callback } = await import("./callback/route");
const { GET: start } = await import("./start/route");
const { signState } = await import("@/lib/channex/oauth-state");

const BACK = "/admin/kanaly";
const location = (res: Response) => new URL(res.headers.get("location")!);

const callbackReq = (params: Record<string, string>) =>
  callback(
    new Request(
      `https://rezflow.pl/api/channex/airbnb/callback?${new URLSearchParams(params)}`
    )
  );

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://rezflow.pl");
  vi.stubEnv("CHANNEX_OAUTH_SECRET", "sekret-do-podpisu-state");
  owner = { property: { id: 3, plan: "PRO" } };
  channexProperty = { propertyId: 3, channexId: "chx-9", status: "ACTIVE" };
  upserts.length = 0;
  events.length = 0;
  oauthStarts.length = 0;
  finishResult = { channelId: "chn-1", status: "active" };
  provider = {
    startAirbnbOAuth: async (channexId: string, redirectUrl: string) => {
      oauthStarts.push({ channexId, redirectUrl });
      return { authUrl: "https://airbnb.example/oauth?state=STATE" };
    },
    finishAirbnbOAuth: async () => {
      if (finishResult instanceof Error) throw finishResult;
      return finishResult;
    },
  };
});

describe("GET /api/channex/airbnb/start", () => {
  it("kieruje do autoryzacji z podpisanym state i adresem powrotu", async () => {
    const res = await start();

    const target = location(res);
    expect(target.origin).toBe("https://airbnb.example");
    const state = target.searchParams.get("state")!;
    expect(state.length).toBeGreaterThan(0);

    // ten sam state musi dać się zweryfikować w callbacku — inaczej pętla
    // OAuth nigdy się nie domyka
    const { verifyState } = await import("@/lib/channex/oauth-state");
    expect(verifyState(state)).toBe(3);

    expect(oauthStarts[0].channexId).toBe("chx-9");
    expect(oauthStarts[0].redirectUrl).toContain("/api/channex/airbnb/callback");
  });

  it("plan bez synchronizacji kanałów zawraca z komunikatem", async () => {
    owner = { property: { id: 3, plan: "FREE" } };

    const res = await start();

    expect(location(res).pathname).toBe(BACK);
    expect(location(res).searchParams.get("error")).toContain("Pro");
    expect(oauthStarts).toEqual([]);
  });

  it("niedokończona konfiguracja Channex nie zaczyna autoryzacji", async () => {
    channexProperty = { propertyId: 3, channexId: "chx-9", status: "PENDING" };

    const res = await start();

    expect(location(res).searchParams.get("error")).toContain("Channex");
    expect(oauthStarts).toEqual([]);
  });
});

describe("GET /api/channex/airbnb/callback", () => {
  it("poprawny powrót zapisuje kanał Airbnb i wraca do panelu z potwierdzeniem", async () => {
    const res = await callbackReq({ state: signState(3), code: "kod-od-airbnb" });

    expect(location(res).pathname).toBe(BACK);
    expect(location(res).searchParams.get("saved")).toBe("1");
    expect(upserts[0].create).toMatchObject({
      propertyId: 3,
      type: "AIRBNB",
      channexChannelId: "chn-1",
      status: "ACTIVE", // status od Channex przychodzi małymi literami
    });
    expect(events[0]).toMatchObject({ propertyId: 3 });
  });

  it("podrobiony state nie podłącza niczego", async () => {
    // to jest właściwa bramka tej trasy: bez ważnego podpisu nie wiemy,
    // czyj to obiekt, i nie wolno nam zapisać kanału
    const res = await callbackReq({ state: "zmyslony-state", code: "kod" });

    expect(location(res).searchParams.get("error")).toBeTruthy();
    expect(upserts).toEqual([]);
  });

  it("state z innego obiektu nie przenosi kanału na cudzy obiekt", async () => {
    // podpis ważny, ale wystawiony na obiekt 77 — zapis ma iść do 77,
    // nigdy do obiektu z sesji czy z parametru
    const res = await callbackReq({ state: signState(77), code: "kod" });

    expect(res.status).toBe(307);
    expect(upserts[0].create).toMatchObject({ propertyId: 77 });
  });

  it("brak kodu autoryzacji zawraca z błędem", async () => {
    const res = await callbackReq({ state: signState(3) });

    expect(location(res).searchParams.get("error")).toBeTruthy();
    expect(upserts).toEqual([]);
  });

  it("pusty state zawraca z błędem", async () => {
    const res = await callbackReq({ code: "kod" });

    expect(location(res).searchParams.get("error")).toBeTruthy();
    expect(upserts).toEqual([]);
  });

  it("brak konfiguracji Channex kończy się komunikatem, nie wyjątkiem", async () => {
    channexProperty = null;

    const res = await callbackReq({ state: signState(3), code: "kod" });

    expect(location(res).searchParams.get("error")).toContain("Channex");
    expect(upserts).toEqual([]);
  });

  it("błąd po stronie Channex zostaje zapisany przy kanale, żeby właściciel go zobaczył", async () => {
    finishResult = new Error("Airbnb odrzucił autoryzację");

    const res = await callbackReq({ state: signState(3), code: "kod" });

    expect(location(res).searchParams.get("error")).toBe("Airbnb odrzucił autoryzację");
    expect(upserts[0].update).toMatchObject({
      status: "ERROR",
      lastError: "Airbnb odrzucił autoryzację",
    });
  });

  it("bardzo długi komunikat błędu jest przycinany do rozmiaru kolumny", async () => {
    finishResult = new Error("x".repeat(500));

    await callbackReq({ state: signState(3), code: "kod" });

    expect(String(upserts[0].update.lastError)).toHaveLength(300);
  });
});
