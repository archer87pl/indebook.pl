import { describe, expect, it } from "vitest";
import { isAppLocale, routing } from "./routing";

// `isAppLocale` to wartownik języka na granicy aplikacji: język przychodzi
// Z ADRESU albo Z COOKIE, więc trafiają tu wartości, których nikt nie
// przewidział — ręcznie podmieniony prefiks, stary link, bot z losową
// ścieżką. Strażnik stoi w sześciu miejscach (layout gościa, API zmiany
// języka, konfiguracja next-intl, maile gościa, strony obiektów), a każde
// z nich robi to samo: nieznany język → domyślny.
//
// Świadomie NIE wywołujemy tu samego `getRequestConfig` z i18n/request.ts:
// serwerowe wejście next-intl rzuca „not supported in Client Components"
// przy warunkach rozwiązywania modułów używanych przez runner, a naginanie
// globalnej konfiguracji pod jeden pięciolinijkowy plik kosztowałoby więcej,
// niż daje. Regułę, którą ten plik składa, trzyma test poniżej; złożenie
// pokrywa tests/e2e/i18n.spec.ts.

describe("isAppLocale", () => {
  it("przepuszcza każdy język serwisu", () => {
    for (const locale of routing.locales) {
      expect(isAppLocale(locale), locale).toBe(true);
    }
  });

  it("odrzuca język spoza listy", () => {
    expect(isAppLocale("fr")).toBe(false);
    expect(isAppLocale("xx")).toBe(false);
  });

  it("odrzuca pusty ciąg", () => {
    expect(isAppLocale("")).toBe(false);
  });

  it("rozróżnia wielkość liter — „PL” nie jest kodem z listy", () => {
    // prefiks w adresie jest małymi literami; przepuszczenie „PL" dałoby
    // dwa adresy tej samej strony i podwójne wpisy w wyszukiwarce
    expect(isAppLocale("PL")).toBe(false);
  });

  it("odrzuca kod z regionem", () => {
    // „pl-PL" bywa w nagłówku Accept-Language — nie jest naszym prefiksem
    expect(isAppLocale("pl-PL")).toBe(false);
  });

  it("nie daje się nabrać na własności prototypu", () => {
    // gdyby wartownik sprawdzał obecność klucza w obiekcie zamiast wpisu
    // na liście, „constructor" albo „toString" przeszłyby jako język
    expect(isAppLocale("constructor")).toBe(false);
    expect(isAppLocale("toString")).toBe(false);
  });
});

describe("konfiguracja tras", () => {
  it("domyślny język jest jednym z obsługiwanych", () => {
    // rozjazd tych dwóch pól oznacza degradację do języka bez słownika
    expect(routing.locales).toContain(routing.defaultLocale);
  });

  it("polski nie ma prefiksu w adresie", () => {
    // zmiana na „always" przekierowałaby wszystkie istniejące adresy /o/slug
    expect(routing.defaultLocale).toBe("pl");
    expect(routing.localePrefix).toBe("as-needed");
  });

  it("kody języków są unikalne", () => {
    expect(new Set(routing.locales).size).toBe(routing.locales.length);
  });
});
