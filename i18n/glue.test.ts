import { describe, expect, it } from "vitest";
import { routing } from "./routing";
import { NAMESPACES, loadMessages } from "./load-messages";

// Wczytywanie słowników: brakujący albo pusty plik oznacza, że gość zobaczy
// dosłowne klucze zamiast zdań — i to na produkcji, bo import jest dynamiczny
// i nie wychwyci tego ani tsc, ani build.
//
// Świadomie NIE testujemy tu i18n/navigation.ts: to jednolinijkowy re-eksport
// createNavigation, którego uruchomienie wymaga klienckiego runtime'u Next,
// a sprawdzałoby zachowanie next-intl, nie nasze. Prefiksy w linkach i
// przełącznik języka pokrywa tests/e2e/i18n.spec.ts.

describe("loadMessages", () => {
  it("wczytuje wszystkie przestrzenie nazw dla każdego języka", async () => {
    for (const locale of routing.locales) {
      const messages = await loadMessages(locale);
      expect(Object.keys(messages).sort(), locale).toEqual([...NAMESPACES].sort());
    }
  });

  it("żadna wczytana przestrzeń nie jest pusta", async () => {
    for (const locale of routing.locales) {
      const messages = await loadMessages(locale);
      for (const ns of NAMESPACES) {
        expect(Object.keys(messages[ns] as object).length, `${locale}/${ns}`).toBeGreaterThan(0);
      }
    }
  });

  it("wszystkie języki dostają ten sam zestaw przestrzeni", async () => {
    // rozjazd oznaczałby, że jeden język ma sekcję, której inne nie mają
    const sets = await Promise.all(
      routing.locales.map(async (l) => Object.keys(await loadMessages(l)).sort().join(","))
    );

    expect(new Set(sets).size).toBe(1);
  });
});
