import { afterEach, describe, expect, it, vi } from "vitest";
import { appHosts, classifyHost, siteUrl, sitesBaseDomain } from "./site-host";
import { PRODUCT_DOMAIN } from "./brand";

afterEach(() => vi.unstubAllEnvs());

const opts = { base: "rezflow.pl", appHosts: ["app.rezflow.pl"] };

describe("classifyHost", () => {
  it("pusty host / localhost / 127.0.0.1 → aplikacja", () => {
    expect(classifyHost(null, opts)).toEqual({ kind: "app" });
    expect(classifyHost("localhost:3000", { ...opts, appHosts: ["localhost"] })).toEqual({
      kind: "app",
    });
    expect(classifyHost("127.0.0.1:3000", { ...opts, appHosts: ["127.0.0.1"] })).toEqual({
      kind: "app",
    });
  });

  it("host aplikacji (także z www) i goła domena bazowa → aplikacja", () => {
    expect(classifyHost("app.rezflow.pl", opts)).toEqual({ kind: "app" });
    expect(classifyHost("www.app.rezflow.pl", opts)).toEqual({ kind: "app" });
    expect(classifyHost("rezflow.pl", opts)).toEqual({ kind: "app" });
    expect(classifyHost("www.rezflow.pl", opts)).toEqual({ kind: "app" });
  });

  it("hosty deploymentów *.vercel.app → aplikacja (preview/prod alias)", () => {
    expect(classifyHost("rezflow-abc123.vercel.app", opts)).toEqual({ kind: "app" });
  });

  it("subdomena bazy → strona obiektu", () => {
    expect(classifyHost("willa.rezflow.pl", opts)).toEqual({ kind: "subdomain", key: "willa" });
    expect(classifyHost("Willa.Rezflow.PL:443", opts)).toEqual({ kind: "subdomain", key: "willa" });
  });

  it("subdomena .localhost (dev) → strona obiektu", () => {
    expect(classifyHost("willa.localhost:3000", opts)).toEqual({
      kind: "subdomain",
      key: "willa",
    });
  });

  it("zagnieżdżone subdomeny bazy → aplikacja (nie obsługujemy)", () => {
    expect(classifyHost("a.b.rezflow.pl", opts)).toEqual({ kind: "app" });
  });

  it("obca domena → potencjalna domena własna (bez www); DB weryfikuje proxy", () => {
    expect(classifyHost("mojobiekt.pl", opts)).toEqual({ kind: "custom", key: "mojobiekt.pl" });
    expect(classifyHost("www.mojobiekt.pl", opts)).toEqual({
      kind: "custom",
      key: "mojobiekt.pl",
    });
    // scenariusz awarii produkcyjnej: domena aplikacji nieujęta w APP_URL
    // klasyfikuje się jako "custom" — proxy przepuści ją do aplikacji,
    // bo nie istnieje w Site.customDomain
    expect(classifyHost("mvp-booking.notelo.pl", opts)).toEqual({
      kind: "custom",
      key: "mvp-booking.notelo.pl",
    });
  });

  it("APP_HOSTS pozwala dopisać dodatkowe hosty aplikacji", () => {
    const withExtra = { ...opts, appHosts: ["app.rezflow.pl", "mvp-booking.notelo.pl"] };
    expect(classifyHost("mvp-booking.notelo.pl", withExtra)).toEqual({ kind: "app" });
  });
});

describe("siteUrl", () => {
  it("zweryfikowana domena własna wygrywa z subdomeną", () => {
    expect(
      siteUrl(
        { subdomain: "willa", customDomain: "mojobiekt.pl", domainStatus: "VERIFIED" },
        { base: "rezflow.pl" }
      )
    ).toBe("https://mojobiekt.pl");
  });

  it("bez zweryfikowanej domeny — subdomena bazy", () => {
    expect(
      siteUrl(
        { subdomain: "willa", customDomain: "mojobiekt.pl", domainStatus: "PENDING" },
        { base: "rezflow.pl" }
      )
    ).toBe("https://willa.rezflow.pl");
    expect(
      siteUrl({ subdomain: "willa", customDomain: null, domainStatus: "NONE" }, { base: "rezflow.pl" })
    ).toBe("https://willa.rezflow.pl");
  });
});

// appHosts() i sitesBaseDomain() czytają środowisko. To one decydują, czy
// żądanie potraktujemy jako aplikację, czy jako stronę WWW obiektu — pomyłka
// tutaj albo wyłącza panel (bo host aplikacji wygląda na cudzą domenę), albo
// pokazuje panel pod adresem klienta.
describe("appHosts", () => {
  it("localhost i pętla zwrotna są hostami aplikacji zawsze", () => {
    expect(appHosts()).toEqual(expect.arrayContaining(["localhost", "127.0.0.1"]));
  });

  it("dokłada host z APP_URL", () => {
    vi.stubEnv("APP_URL", "https://app.rezflow.pl");
    expect(appHosts()).toContain("app.rezflow.pl");
  });

  it("port i ścieżka w APP_URL nie wchodzą do listy hostów", () => {
    // porównanie w classifyHost idzie po samej nazwie hosta
    vi.stubEnv("APP_URL", "http://localhost:3100/panel");
    expect(appHosts()).toContain("localhost");
    expect(appHosts().some((h) => h.includes(":"))).toBe(false);
  });

  it("hosty deploymentu Vercela są traktowane jak aplikacja", () => {
    // bez tego podgląd PR-a klasyfikowałby się jako obca domena i zwracał 404
    vi.stubEnv("VERCEL_URL", "rezflow-git-feature.vercel.app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "rezflow.vercel.app");

    expect(appHosts()).toEqual(
      expect.arrayContaining(["rezflow-git-feature.vercel.app", "rezflow.vercel.app"])
    );
  });

  it("APP_HOSTS pozwala dopisać kilka hostów po przecinku, ze spacjami", () => {
    // typowy przypadek: stara domena po migracji
    vi.stubEnv("APP_HOSTS", "stara-domena.pl , panel.rezflow.pl");

    expect(appHosts()).toEqual(
      expect.arrayContaining(["stara-domena.pl", "panel.rezflow.pl"])
    );
  });

  it("puste i niepoprawne wpisy są pomijane, bez pustych ciągów na liście", () => {
    vi.stubEnv("APP_HOSTS", ",, ,");
    vi.stubEnv("APP_URL", ":::niepoprawny:::");

    const hosts = appHosts();
    expect(hosts.every((h) => h.length > 0)).toBe(true);
    expect(hosts).toContain("localhost");
  });

  it("nie duplikuje hostów podanych w dwóch miejscach", () => {
    vi.stubEnv("APP_URL", "https://rezflow.pl");
    vi.stubEnv("APP_HOSTS", "rezflow.pl");

    const hosts = appHosts();
    expect(hosts.filter((h) => h === "rezflow.pl")).toHaveLength(1);
  });
});

describe("sitesBaseDomain", () => {
  it("bez konfiguracji bierze domenę produktu", () => {
    vi.stubEnv("SITES_BASE_DOMAIN", "");
    expect(sitesBaseDomain()).toBe(PRODUCT_DOMAIN.toLowerCase());
  });

  it("SITES_BASE_DOMAIN nadpisuje i schodzi do małych liter", () => {
    vi.stubEnv("SITES_BASE_DOMAIN", "Strony.RezFlow.PL");
    expect(sitesBaseDomain()).toBe("strony.rezflow.pl");
  });
});

describe("siteUrl bez jawnej bazy (środowisko)", () => {
  const site = { subdomain: "willa", customDomain: null, domainStatus: "NONE" };

  it("na localhoście oddaje adres z subdomeną i portem dev-serwera", () => {
    // dev: nazwa.localhost:3100 — na tym stoją testy e2e stron WWW
    vi.stubEnv("APP_URL", "http://localhost:3100");
    expect(siteUrl(site)).toBe("http://willa.localhost:3100");
  });

  it("localhost bez portu nie dokleja dwukropka", () => {
    vi.stubEnv("APP_URL", "http://localhost");
    expect(siteUrl(site)).toBe("http://willa.localhost");
  });

  it("na produkcji oddaje subdomenę domeny bazowej po HTTPS", () => {
    vi.stubEnv("APP_URL", "https://rezflow.pl");
    vi.stubEnv("SITES_BASE_DOMAIN", "rezflow.pl");
    expect(siteUrl(site)).toBe("https://willa.rezflow.pl");
  });

  it("niepoprawny APP_URL spada na adres produkcyjny, a nie wywala renderu", () => {
    // panel pokazuje ten adres na każdym ekranie strony WWW
    vi.stubEnv("APP_URL", ":::niepoprawny:::");
    vi.stubEnv("SITES_BASE_DOMAIN", "rezflow.pl");
    expect(siteUrl(site)).toBe("https://willa.rezflow.pl");
  });

  it("zweryfikowana domena własna wygrywa także w dev", () => {
    vi.stubEnv("APP_URL", "http://localhost:3100");
    expect(
      siteUrl({ subdomain: "willa", customDomain: "willa.pl", domainStatus: "VERIFIED" })
    ).toBe("https://willa.pl");
  });

  it("domena własna niezweryfikowana nie jest używana", () => {
    // routing wpuszcza tylko VERIFIED — link do niezweryfikowanej byłby martwy
    vi.stubEnv("APP_URL", "https://rezflow.pl");
    vi.stubEnv("SITES_BASE_DOMAIN", "rezflow.pl");
    expect(
      siteUrl({ subdomain: "willa", customDomain: "willa.pl", domainStatus: "PENDING" })
    ).toBe("https://willa.rezflow.pl");
  });
});
