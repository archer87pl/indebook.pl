import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Proxy hostów — drzwi wejściowe całej aplikacji, uruchamiane przy KAŻDYM
// żądaniu. Trzy rzeczy muszą tu być pewne: subdomeny bazy trafiają na strony
// obiektów, obca domena tylko wtedy, gdy jest ZWERYFIKOWANA w bazie, a błąd
// bazy nie może wyłączyć aplikacji (nierozpoznany host idzie do aplikacji,
// czyli produkcja pokazuje landing, nie 404).

let verifiedSite: { id: number } | null = null;
let dbThrows = false;
const domainQueries: string[] = [];

vi.mock("@/lib/db", () => ({
  prisma: {
    site: {
      findFirst: async ({ where }: { where: { customDomain: string; domainStatus: string } }) => {
        domainQueries.push(`${where.customDomain}:${where.domainStatus}`);
        if (dbThrows) throw new Error("baza padła");
        return verifiedSite;
      },
    },
  },
}));

const intlCalls: string[] = [];
vi.mock("next-intl/middleware", () => ({
  default: () => (request: { nextUrl: { pathname: string } }) => {
    intlCalls.push(request.nextUrl.pathname);
    return { __intl: true, headers: new Headers() };
  },
}));

const { proxy, config } = await import("./proxy");

/** Minimalny NextRequest: proxy używa tylko hosta i nextUrl. */
function request(host: string, pathname = "/") {
  const url = new URL(`http://localhost:3000${pathname}`);
  return {
    headers: new Headers({ host }),
    nextUrl: {
      pathname,
      clone: () => {
        const clone = new URL(url);
        return clone;
      },
    },
  } as never;
}

// Cache domen jest modułowy i żyje przez cały plik — każdy test dostaje więc
// własną domenę, zamiast liczyć na czyszczenie stanu między testami.
let hostSeq = 0;
const freshDomain = () => `klient-${++hostSeq}.pl`;

/** Ścieżka, na którą proxy przepisało żądanie (null = przepuszczone dalej). */
function rewrittenTo(res: unknown): string | null {
  const location = (res as Response)?.headers?.get?.("x-middleware-rewrite");
  return location ? new URL(location).pathname : null;
}

beforeEach(() => {
  verifiedSite = null;
  dbThrows = false;
  domainQueries.length = 0;
  intlCalls.length = 0;
  vi.stubEnv("SITES_BASE_DOMAIN", "rezflow.pl");
  vi.stubEnv("APP_URL", "https://rezflow.pl");
  vi.stubEnv("APP_HOSTS", "");
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 30, 12, 0, 0));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("host aplikacji", () => {
  it("trasy panelu przechodzą bez tłumaczeń i bez przepisania", async () => {
    // panel recepcji jest jednojęzyczny — puszczenie go przez next-intl
    // dodałoby mu prefiks języka w adresie
    const res = await proxy(request("rezflow.pl", "/admin/rezerwacje"));

    expect(intlCalls).toEqual([]);
    expect(rewrittenTo(res)).toBeNull();
  });

  it("trasy gościa przechodzą przez routing języków", async () => {
    await proxy(request("rezflow.pl", "/o/willa-pod-debem"));

    expect(intlCalls).toEqual(["/o/willa-pod-debem"]);
  });

  it("landing i API nie dostają prefiksu języka", async () => {
    for (const path of ["/", "/cennik", "/superadmin"]) {
      intlCalls.length = 0;
      await proxy(request("rezflow.pl", path));
      expect(intlCalls, path).toEqual([]);
    }
  });

  it("goła domena bazowa i localhost to aplikacja", async () => {
    for (const host of ["rezflow.pl", "www.rezflow.pl", "localhost:3000", "127.0.0.1"]) {
      const res = await proxy(request(host, "/admin"));
      expect(rewrittenTo(res), host).toBeNull();
    }
  });
});

describe("subdomeny bazy", () => {
  it("przepisuje subdomenę na stronę obiektu, bez pytania bazy", async () => {
    // subdomeny są nasze — lookup byłby zapytaniem przy każdym żądaniu
    const res = await proxy(request("willa.rezflow.pl", "/"));

    expect(rewrittenTo(res)).toBe("/sites/willa");
    expect(domainQueries).toEqual([]);
  });

  it("ścieżka podstrony zostaje doklejona za kluczem strony", async () => {
    const res = await proxy(request("willa.rezflow.pl", "/kontakt"));

    expect(rewrittenTo(res)).toBe("/sites/willa/kontakt");
  });

  it("korzeń nie produkuje podwójnego ukośnika", async () => {
    const res = await proxy(request("willa.rezflow.pl", "/"));

    expect(rewrittenTo(res)).not.toContain("//");
  });

  it("subdomena .localhost działa tak samo w dev", async () => {
    const res = await proxy(request("willa.localhost:3100", "/"));

    expect(rewrittenTo(res)).toBe("/sites/willa");
  });
});

describe("domeny własne", () => {
  it("zweryfikowana domena kieruje na stronę obiektu", async () => {
    verifiedSite = { id: 21 };
    const domain = freshDomain();

    const res = await proxy(request(domain, "/"));

    expect(rewrittenTo(res)).toBe(`/sites/${domain}`);
    expect(domainQueries).toEqual([`${domain}:VERIFIED`]);
  });

  it("pytanie do bazy dotyczy WYŁĄCZNIE domen zweryfikowanych", async () => {
    // niezweryfikowany claim nie może przekierowywać ruchu — DNS jeszcze
    // nie wskazuje na nas, a wpis w bazie mógł zrobić ktokolwiek
    await proxy(request(freshDomain(), "/"));

    expect(domainQueries[0]).toContain(":VERIFIED");
  });

  it("nieznana domena przechodzi do aplikacji, a nie na 404", async () => {
    // to jest zabezpieczenie przed samobójstwem: błędna konfiguracja
    // APP_URL nie może wyłączyć całego serwisu
    verifiedSite = null;

    const res = await proxy(request(freshDomain(), "/"));

    expect(rewrittenTo(res)).toBeNull();
  });

  it("awaria bazy przepuszcza żądanie do aplikacji", async () => {
    // fail-open jest tu świadomy: lepiej pokazać landing niż 404 na całej
    // domenie klienta, gdy baza chwilowo nie odpowiada
    dbThrows = true;

    const res = await proxy(request(freshDomain(), "/"));

    expect(rewrittenTo(res)).toBeNull();
  });
});

describe("cache lookupu domen", () => {
  it("drugie żądanie tego samego hosta nie pyta bazy", async () => {
    verifiedSite = { id: 21 };
    const domain = freshDomain();

    await proxy(request(domain, "/"));
    await proxy(request(domain, "/kontakt"));

    expect(domainQueries).toHaveLength(1);
  });

  it("wynik negatywny też jest cache'owany — chroni przed zalewem zapytań", async () => {
    verifiedSite = null;
    const domain = freshDomain();

    await proxy(request(domain, "/"));
    await proxy(request(domain, "/"));

    expect(domainQueries).toHaveLength(1);
  });

  it("po minucie wynik jest odświeżany", async () => {
    // podpięcie domeny musi zadziałać bez restartu instancji
    verifiedSite = null;
    const domain = freshDomain();
    await proxy(request(domain, "/"));

    vi.advanceTimersByTime(61_000);
    verifiedSite = { id: 21 };
    const res = await proxy(request(domain, "/"));

    expect(domainQueries).toHaveLength(2);
    expect(rewrittenTo(res)).toBe(`/sites/${domain}`);
  });

  it("zalew unikalnych hostów nie rozdyma cache'u bez końca", async () => {
    // skan po losowych domenach nie może wysadzić instancji z pamięci
    verifiedSite = null;

    for (let i = 0; i < 5_100; i++) {
      await proxy(request(`host-${i}.pl`, "/"));
    }

    // po przekroczeniu progu cache jest czyszczony, więc kolejne żądanie
    // o host sprzed czyszczenia znów pyta bazę
    const before = domainQueries.length;
    await proxy(request("host-0.pl", "/"));
    expect(domainQueries.length).toBe(before + 1);
  });
});

describe("zakres działania (matcher)", () => {
  // matcher Next dopasowuje CAŁĄ ścieżkę — bez zakotwiczenia „/api/x" trafiałby
  // w dopasowanie gdzieś w środku i test przechodziłby dla złych ścieżek
  const matches = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);

  it("pomija zasoby Next, API, ikony i pliki wgrane przez właścicieli", async () => {
    // API musi zostać nietknięte: widget kalendarza i formularz kontaktowy
    // ze stron obiektów biją w nie z tej samej domeny
    for (const path of ["/_next/static/x.js", "/api/sites/inquiry", "/favicon.ico", "/icon", "/uploads/p3-a.jpg"]) {
      expect(matches(path), path).toBe(false);
    }
  });

  it("obejmuje trasy stron, panelu i gościa", async () => {
    for (const path of ["/", "/admin/rezerwacje", "/o/willa", "/kontakt"]) {
      expect(matches(path), path).toBe(true);
    }
  });
});
