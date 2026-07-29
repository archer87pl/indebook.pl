import { beforeEach, describe, expect, it, vi } from "vitest";
import { routing } from "@/i18n/routing";

// Strony WWW obiektów nie mają prefiksu języka w adresie (proxy przepisuje
// host), więc język siedzi w ciasteczku. Wartość ciasteczka przychodzi od
// przeglądarki, czyli od kogokolwiek — musi być zweryfikowana, zanim trafi
// do next-intl, bo nieznany język wywraca render całej strony.

let cookieValue: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "SITE_LOCALE" && cookieValue !== undefined
        ? { name, value: cookieValue }
        : undefined,
  }),
}));

const { SITE_LOCALE_COOKIE, getSiteLocale } = await import("./site-locale");

beforeEach(() => {
  cookieValue = undefined;
});

describe("getSiteLocale", () => {
  it("bez ciasteczka strona jest po polsku", () => {
    expect(routing.defaultLocale).toBe("pl");
  });

  it("brak ciasteczka daje język domyślny", async () => {
    expect(await getSiteLocale()).toBe(routing.defaultLocale);
  });

  it("obsługiwany język przechodzi", async () => {
    for (const locale of routing.locales) {
      cookieValue = locale;
      expect(await getSiteLocale()).toBe(locale);
    }
  });

  it("nieobsługiwany język degraduje do domyślnego", async () => {
    cookieValue = "fr";
    expect(await getSiteLocale()).toBe(routing.defaultLocale);
  });

  it("śmieci z ciasteczka nie przechodzą dalej", async () => {
    for (const junk of ["", "PL", "pl-PL", "../../etc", "<script>", "en;de"]) {
      cookieValue = junk;
      expect(await getSiteLocale(), `wartość: ${junk}`).toBe(routing.defaultLocale);
    }
  });

  it("nazwa ciasteczka jest stała — czyta ją też przełącznik po stronie klienta", () => {
    expect(SITE_LOCALE_COOKIE).toBe("SITE_LOCALE");
  });
});
