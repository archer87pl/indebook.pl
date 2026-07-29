import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routing } from "@/i18n/routing";

// Adresy per język zasilają hreflang, canonical i sitemapę. Rozjazd między
// nimi a realnym routingiem (PL bez prefiksu, EN/DE z prefiksem) to nie błąd
// widoczny w aplikacji, tylko cicha strata w wynikach wyszukiwania.

beforeEach(() => vi.stubEnv("APP_URL", "https://rezflow.pl"));
afterEach(() => vi.unstubAllEnvs());

const { localeAlternates, localePath, localeUrl } = await import("./locale-urls");

describe("localePath", () => {
  it("domyślny język (PL) zostaje bez prefiksu", () => {
    expect(localePath("/o/willa", "pl")).toBe("/o/willa");
  });

  it("pozostałe języki dostają prefiks", () => {
    expect(localePath("/o/willa", "en")).toBe("/en/o/willa");
    expect(localePath("/o/willa", "de")).toBe("/de/o/willa");
  });

  it("ścieżka bez wiodącego ukośnika jest normalizowana", () => {
    expect(localePath("o/willa", "en")).toBe("/en/o/willa");
    expect(localePath("o/willa", "pl")).toBe("/o/willa");
  });

  it("korzeń serwisu nie robi się podwójnym ukośnikiem", () => {
    expect(localePath("/", "pl")).toBe("/");
    expect(localePath("/", "en")).toBe("/en/");
  });

  it("zachowuje parametry zapytania", () => {
    expect(localePath("/szukaj?od=2026-08-01", "de")).toBe("/de/szukaj?od=2026-08-01");
  });
});

describe("localeUrl", () => {
  it("skleja pełny adres z APP_URL", () => {
    expect(localeUrl("/o/willa", "pl")).toBe("https://rezflow.pl/o/willa");
    expect(localeUrl("/o/willa", "en")).toBe("https://rezflow.pl/en/o/willa");
  });

  it("nie dubluje ukośnika, gdy APP_URL kończy się ukośnikiem", () => {
    vi.stubEnv("APP_URL", "https://rezflow.pl/");
    expect(localeUrl("/o/willa", "pl")).toBe("https://rezflow.pl/o/willa");
  });
});

describe("localeAlternates", () => {
  const alternates = () => localeAlternates("/o/willa");

  it("wymienia wszystkie języki serwisu", () => {
    for (const locale of routing.locales) {
      expect(alternates(), `brak ${locale}`).toHaveProperty(locale);
    }
  });

  it("x-default wskazuje wersję domyślną", () => {
    // to ta wersja trafia do użytkowników spoza obsługiwanych języków
    const map = alternates();
    expect(map["x-default"]).toBe(map[routing.defaultLocale]);
    expect(map["x-default"]).toBe("https://rezflow.pl/o/willa");
  });

  it("każdy adres jest bezwzględny — hreflang nie przyjmuje ścieżek", () => {
    for (const url of Object.values(alternates())) {
      expect(url).toMatch(/^https:\/\//);
    }
  });

  it("adresy są różne dla różnych języków", () => {
    // wspólny URL dla wszystkich języków to sygnał duplikatu treści
    const urls = routing.locales.map((l) => alternates()[l]);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
