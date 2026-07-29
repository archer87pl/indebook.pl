import { describe, expect, it, vi } from "vitest";
import { routing } from "@/i18n/routing";

// Gość dostaje maile w języku, w którym rezerwował — wartość przychodzi
// z bazy (Reservation.locale), a więc z rekordu, który mógł powstać przy
// innej wersji aplikacji. Nieznany język nie może wywrócić wysyłki
// potwierdzenia, bo rezerwacja jest już opłacona.

const asked: { locale?: string; namespace?: string }[] = [];

vi.mock("next-intl/server", () => ({
  getTranslations: async (opts: { locale?: string; namespace?: string }) => {
    asked.push(opts);
    return (key: string) => key;
  },
}));

const { guestT } = await import("./guest-mail");

describe("guestT", () => {
  it("bierze tłumaczenia z przestrzeni „email”", async () => {
    asked.length = 0;
    await guestT("pl");
    expect(asked[0].namespace).toBe("email");
  });

  it("przepuszcza każdy obsługiwany język", async () => {
    for (const locale of routing.locales) {
      asked.length = 0;
      await guestT(locale);
      expect(asked[0].locale).toBe(locale);
    }
  });

  it("nieznany język degraduje do domyślnego zamiast rzucać", async () => {
    for (const junk of ["fr", "", "PL", "pl-PL", "null"]) {
      asked.length = 0;
      await expect(guestT(junk)).resolves.toBeTypeOf("function");
      expect(asked[0].locale, `wartość: ${junk}`).toBe(routing.defaultLocale);
    }
  });
});
