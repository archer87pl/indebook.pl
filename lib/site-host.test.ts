import { describe, expect, it } from "vitest";
import { classifyHost, siteUrl } from "./site-host";

const opts = { base: "rezop.pl", appHosts: ["app.rezio.pl"] };

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
    expect(classifyHost("app.rezio.pl", opts)).toEqual({ kind: "app" });
    expect(classifyHost("www.app.rezio.pl", opts)).toEqual({ kind: "app" });
    expect(classifyHost("rezop.pl", opts)).toEqual({ kind: "app" });
    expect(classifyHost("www.rezop.pl", opts)).toEqual({ kind: "app" });
  });

  it("hosty deploymentów *.vercel.app → aplikacja (preview/prod alias)", () => {
    expect(classifyHost("rezio-abc123.vercel.app", opts)).toEqual({ kind: "app" });
  });

  it("subdomena bazy → strona obiektu", () => {
    expect(classifyHost("willa.rezop.pl", opts)).toEqual({ kind: "subdomain", key: "willa" });
    expect(classifyHost("Willa.Rezop.PL:443", opts)).toEqual({ kind: "subdomain", key: "willa" });
  });

  it("subdomena .localhost (dev) → strona obiektu", () => {
    expect(classifyHost("willa.localhost:3000", opts)).toEqual({
      kind: "subdomain",
      key: "willa",
    });
  });

  it("zagnieżdżone subdomeny bazy → aplikacja (nie obsługujemy)", () => {
    expect(classifyHost("a.b.rezop.pl", opts)).toEqual({ kind: "app" });
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
    const withExtra = { ...opts, appHosts: ["app.rezio.pl", "mvp-booking.notelo.pl"] };
    expect(classifyHost("mvp-booking.notelo.pl", withExtra)).toEqual({ kind: "app" });
  });
});

describe("siteUrl", () => {
  it("zweryfikowana domena własna wygrywa z subdomeną", () => {
    expect(
      siteUrl(
        { subdomain: "willa", customDomain: "mojobiekt.pl", domainStatus: "VERIFIED" },
        { base: "rezop.pl" }
      )
    ).toBe("https://mojobiekt.pl");
  });

  it("bez zweryfikowanej domeny — subdomena bazy", () => {
    expect(
      siteUrl(
        { subdomain: "willa", customDomain: "mojobiekt.pl", domainStatus: "PENDING" },
        { base: "rezop.pl" }
      )
    ).toBe("https://willa.rezop.pl");
    expect(
      siteUrl({ subdomain: "willa", customDomain: null, domainStatus: "NONE" }, { base: "rezop.pl" })
    ).toBe("https://willa.rezop.pl");
  });
});
