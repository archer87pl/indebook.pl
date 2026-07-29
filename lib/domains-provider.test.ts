import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { domainProvider } from "./domains";

// Podłączanie domen własnych klientów przez API Vercela. Operacje są widoczne
// na zewnątrz (wpis w projekcie, certyfikat SSL), a wariant `www` musi jechać
// razem z apeksem — inaczej połowa gości trafia na błąd certyfikatu.
// (mapVercelStatus i normalizeDomain mają testy w domains.test.ts.)

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];

function respond(...bodies: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const body = bodies[Math.min(calls.length - 1, bodies.length - 1)];
      return new Response(typeof body === "string" ? body : JSON.stringify(body ?? {}), {
        status: 200,
      });
    })
  );
}

const bodyOf = (call: Call) => (call.init.body ? JSON.parse(call.init.body as string) : null);

beforeEach(() => {
  calls = [];
  vi.stubEnv("VERCEL_TOKEN", "token-vercela");
  vi.stubEnv("VERCEL_PROJECT_ID", "prj_123");
  vi.stubEnv("VERCEL_TEAM_ID", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("domainProvider", () => {
  it("bez tokenu nie ma providera — sekcja domen jest wtedy ukryta w panelu", () => {
    // null jest sygnałem „funkcja niedostępna", nie błędem konfiguracji
    vi.stubEnv("VERCEL_TOKEN", "");
    expect(domainProvider()).toBeNull();
  });

  it("bez identyfikatora projektu też nie ma providera", () => {
    vi.stubEnv("VERCEL_PROJECT_ID", "");
    expect(domainProvider()).toBeNull();
  });

  it("komplet danych daje działającego providera", () => {
    expect(domainProvider()).not.toBeNull();
  });
});

describe("dodawanie domeny", () => {
  it("dodaje apeks i wariant www przekierowany na apeks", async () => {
    // klient wpisuje w przeglądarce jedno albo drugie — muszą działać oba
    respond({}, {});

    await domainProvider()!.add("willa.pl");

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://api.vercel.com/v10/projects/prj_123/domains");
    expect(bodyOf(calls[0])).toEqual({ name: "willa.pl" });
    expect(bodyOf(calls[1])).toEqual({ name: "www.willa.pl", redirect: "willa.pl" });
  });

  it("uwierzytelnia się tokenem w nagłówku", async () => {
    respond({}, {});

    await domainProvider()!.add("willa.pl");

    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(
      "Bearer token-vercela"
    );
    expect(calls[0].url).not.toContain("token-vercela");
  });

  it("konto zespołowe dokłada identyfikator zespołu do adresu", async () => {
    // bez teamId Vercel odpowiada 404 na projekt należący do zespołu
    vi.stubEnv("VERCEL_TEAM_ID", "team_abc");
    respond({}, {});

    await domainProvider()!.add("willa.pl");

    expect(calls[0].url).toContain("?teamId=team_abc");
  });
});

describe("sprawdzanie statusu", () => {
  it("pyta o wpis w projekcie i o konfigurację DNS, po czym mapuje wynik", async () => {
    respond({ verified: true }, { misconfigured: false });

    const check = await domainProvider()!.check("willa.pl");

    expect(calls.map((c) => c.url)).toEqual([
      "https://api.vercel.com/v9/projects/prj_123/domains/willa.pl",
      "https://api.vercel.com/v6/domains/willa.pl/config",
    ]);
    expect(check.status).toBe("VERIFIED");
  });

  it("niezweryfikowana domena wraca jako oczekująca, z rekordami do wpisania", async () => {
    respond(
      {
        verified: false,
        verification: [{ type: "TXT", domain: "_vercel.willa.pl", value: "vc-domain-verify=..." }],
      },
      {}
    );

    const check = await domainProvider()!.check("willa.pl");

    expect(check.status).toBe("PENDING");
    expect(check.records.some((r) => r.type === "TXT")).toBe(true);
  });

  it("odpowiedź, której nie da się sparsować, nie wywraca panelu", async () => {
    // ekran domen musi pokazać status, a nie 500
    respond("<html>502 Bad Gateway</html>");

    const check = await domainProvider()!.check("willa.pl");

    expect(check.status).toBe("PENDING");
    expect(check.records.length).toBeGreaterThan(0);
  });

  it("błąd z API trafia do komunikatu dla właściciela", async () => {
    respond({ error: { message: "Domain is already in use by another project" } }, {});

    const check = await domainProvider()!.check("willa.pl");

    expect(check.status).toBe("ERROR");
    expect(check.message).toContain("already in use");
  });
});

describe("odłączanie domeny", () => {
  it("usuwa wariant www przed apeksem", async () => {
    // odwrotna kolejność zostawia osierocone przekierowanie na nieistniejący
    // wpis, a Vercel odmawia jego usunięcia
    respond({}, {});

    await domainProvider()!.remove("willa.pl");

    expect(calls.map((c) => c.url)).toEqual([
      "https://api.vercel.com/v9/projects/prj_123/domains/www.willa.pl",
      "https://api.vercel.com/v9/projects/prj_123/domains/willa.pl",
    ]);
    expect(calls.every((c) => c.init.method === "DELETE")).toBe(true);
  });

  it("usuwanie nie wysyła treści żądania", async () => {
    respond({}, {});

    await domainProvider()!.remove("willa.pl");

    expect(calls[0].init.body).toBeUndefined();
    expect((calls[0].init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });
});
