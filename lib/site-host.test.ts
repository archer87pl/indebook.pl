import { describe, expect, it } from "vitest";
import { classifyHost, siteUrl } from "./site-host";

const opts = { base: "rezop.pl", appHost: "app.rezio.pl" };

describe("classifyHost", () => {
  it("pusty host / localhost / 127.0.0.1 → aplikacja", () => {
    expect(classifyHost(null, opts)).toEqual({ kind: "app" });
    expect(classifyHost("localhost:3000", opts)).toEqual({ kind: "app" });
    expect(classifyHost("127.0.0.1:3000", opts)).toEqual({ kind: "app" });
  });

  it("host aplikacji i goła domena bazowa → aplikacja", () => {
    expect(classifyHost("app.rezio.pl", opts)).toEqual({ kind: "app" });
    expect(classifyHost("rezop.pl", opts)).toEqual({ kind: "app" });
    expect(classifyHost("www.rezop.pl", opts)).toEqual({ kind: "app" });
  });

  it("subdomena bazy → strona obiektu", () => {
    expect(classifyHost("willa.rezop.pl", opts)).toEqual({ kind: "site", key: "willa" });
    expect(classifyHost("Willa.Rezop.PL:443", opts)).toEqual({ kind: "site", key: "willa" });
  });

  it("subdomena .localhost (dev) → strona obiektu", () => {
    expect(classifyHost("willa.localhost:3000", opts)).toEqual({ kind: "site", key: "willa" });
  });

  it("zagnieżdżone subdomeny bazy → aplikacja (nie obsługujemy)", () => {
    expect(classifyHost("a.b.rezop.pl", opts)).toEqual({ kind: "app" });
  });

  it("obca domena → strona obiektu po pełnym hoście (bez www)", () => {
    expect(classifyHost("mojobiekt.pl", opts)).toEqual({ kind: "site", key: "mojobiekt.pl" });
    expect(classifyHost("www.mojobiekt.pl", opts)).toEqual({ kind: "site", key: "mojobiekt.pl" });
  });
});

describe("siteUrl", () => {
  it("zweryfikowana domena własna wygrywa z subdomeną", () => {
    expect(
      siteUrl({ subdomain: "willa", customDomain: "mojobiekt.pl", domainStatus: "VERIFIED" }, opts)
    ).toBe("https://mojobiekt.pl");
  });

  it("bez zweryfikowanej domeny — subdomena bazy", () => {
    expect(
      siteUrl({ subdomain: "willa", customDomain: "mojobiekt.pl", domainStatus: "PENDING" }, opts)
    ).toBe("https://willa.rezop.pl");
    expect(siteUrl({ subdomain: "willa", customDomain: null, domainStatus: "NONE" }, opts)).toBe(
      "https://willa.rezop.pl"
    );
  });
});
