import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GUEST_ERROR_CODES, guestErrorQuery, isGuestErrorCode } from "./guest-errors";

const LOCALES = ["pl", "en", "de"] as const;

function errorsFor(locale: string): Record<string, string> {
  const path = join(__dirname, "..", "messages", locale, "common.json");
  return (JSON.parse(readFileSync(path, "utf8")) as { errors: Record<string, string> }).errors;
}

describe("isGuestErrorCode", () => {
  it("przepuszcza znane kody", () => {
    expect(isGuestErrorCode("invalidRange")).toBe(true);
    expect(isGuestErrorCode("reviewTooLong")).toBe(true);
  });

  it("odrzuca cokolwiek innego — parametr przychodzi z URL-a", () => {
    expect(isGuestErrorCode("cudzy-tekst")).toBe(false);
    expect(isGuestErrorCode("")).toBe(false);
    expect(isGuestErrorCode("<script>")).toBe(false);
    expect(isGuestErrorCode("errors.invalidRange")).toBe(false);
  });
});

describe("guestErrorQuery", () => {
  it("bez liczby zwraca sam kod", () => {
    expect(guestErrorQuery("invalidRange")).toBe("error=invalidRange");
  });

  it("z liczbą dokłada parametr n", () => {
    expect(guestErrorQuery("maxGuests", 4)).toBe("error=maxGuests&n=4");
  });

  it("zero jest liczbą, nie brakiem wartości", () => {
    expect(guestErrorQuery("minStay", 0)).toBe("error=minStay&n=0");
  });
});

describe("słowniki komunikatów", () => {
  it.each(LOCALES)("%s ma tłumaczenie każdego kodu błędu", (locale) => {
    const errors = errorsFor(locale);
    const missing = GUEST_ERROR_CODES.filter((code) => !errors[code]);
    expect(missing, `brakuje w ${locale}: ${missing.join(", ")}`).toEqual([]);
  });

  it.each(LOCALES)("%s ma komunikat ogólny dla nieznanego kodu", (locale) => {
    expect(errorsFor(locale).generic).toBeTruthy();
  });

  it("komunikaty z liczbą używają placeholdera {n} we wszystkich językach", () => {
    // inaczej gość zobaczyłby „mieści maksymalnie os." bez liczby
    const withCount = [
      "maxGuests",
      "minStay",
      "guestsRange",
      "reviewTooLong",
      "additionalGuestName",
      "additionalGuestBirthDate",
    ];
    for (const locale of LOCALES) {
      const errors = errorsFor(locale);
      for (const code of withCount) {
        expect(errors[code], `${locale}.${code}`).toContain("{n");
      }
    }
  });

  it("żaden język nie ma pustych wartości", () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(errorsFor(locale))) {
        expect(value.trim(), `${locale}.${key}`).not.toBe("");
      }
    }
  });
});
