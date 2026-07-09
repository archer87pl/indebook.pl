import { describe, expect, it } from "vitest";
import {
  canCheckIn,
  isValidSignature,
  maskDocNumber,
  parseAdditionalGuests,
} from "./checkin";
import { addDaysISO, todayISO } from "./dates";

// bufor z nagłówkiem PNG i wypełnieniem — wystarcza walidatorowi
const pngBytes = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(100),
]);
const TINY_PNG = `data:image/png;base64,${pngBytes.toString("base64")}`;

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

describe("isValidSignature", () => {
  it("odrzuca pusty string i zły prefiks", () => {
    expect(isValidSignature("")).toBe(false);
    expect(isValidSignature("data:image/jpeg;base64,abc")).toBe(false);
    expect(isValidSignature("<script>")).toBe(false);
  });

  it("odrzuca base64 bez sygnatury PNG", () => {
    const notPng = `data:image/png;base64,${Buffer.from("x".repeat(200)).toString("base64")}`;
    expect(isValidSignature(notPng)).toBe(false);
  });

  it("odrzuca podpis przekraczający limit rozmiaru", () => {
    const huge = `data:image/png;base64,${"A".repeat(300_000)}`;
    expect(isValidSignature(huge)).toBe(false);
  });

  it("akceptuje poprawny PNG data URL", () => {
    expect(isValidSignature(TINY_PNG)).toBe(true);
  });
});

describe("parseAdditionalGuests", () => {
  it("pomija puste wiersze", () => {
    const r = parseAdditionalGuests(formData({}), 3);
    expect(r.error).toBe("");
    expect(r.guests).toEqual([]);
  });

  it("zbiera wypełnione wiersze", () => {
    const r = parseAdditionalGuests(
      formData({
        guestName_1: "Anna Nowak",
        guestBirth_1: "1990-05-01",
        guestName_2: "Jan Nowak",
      }),
      2
    );
    expect(r.error).toBe("");
    expect(r.guests).toEqual([
      { name: "Anna Nowak", birthDate: "1990-05-01" },
      { name: "Jan Nowak", birthDate: "" },
    ]);
  });

  it("odrzuca datę urodzenia z przyszłości i wiersz bez imienia", () => {
    expect(
      parseAdditionalGuests(
        formData({ guestName_1: "Anna Nowak", guestBirth_1: addDaysISO(todayISO(), 1) }),
        1
      ).error
    ).not.toBe("");
    expect(
      parseAdditionalGuests(formData({ guestBirth_1: "1990-05-01" }), 1).error
    ).not.toBe("");
  });

  it("ignoruje wiersze powyżej limitu liczby gości", () => {
    const r = parseAdditionalGuests(formData({ guestName_3: "Ktoś Obcy" }), 2);
    expect(r.error).toBe("");
    expect(r.guests).toEqual([]);
  });
});

describe("maskDocNumber", () => {
  it("maskuje środek numeru", () => {
    expect(maskDocNumber("ABC123456")).toBe("AB…56");
    expect(maskDocNumber("AB12")).toBe("•••");
    expect(maskDocNumber("")).toBe("—");
  });
});

describe("canCheckIn", () => {
  const base = {
    status: "CONFIRMED",
    checkInStatus: "NONE",
    checkOut: addDaysISO(todayISO(), 2),
  };

  it("dostępny dla potwierdzonej rezerwacji przed wymeldowaniem", () => {
    expect(canCheckIn(base)).toBe(true);
    // także w dniu wymeldowania
    expect(canCheckIn({ ...base, checkOut: todayISO() })).toBe(true);
  });

  it("niedostępny dla PENDING/CANCELLED, po pobycie i po wypełnieniu", () => {
    expect(canCheckIn({ ...base, status: "PENDING" })).toBe(false);
    expect(canCheckIn({ ...base, status: "CANCELLED" })).toBe(false);
    expect(canCheckIn({ ...base, checkOut: addDaysISO(todayISO(), -1) })).toBe(false);
    expect(canCheckIn({ ...base, checkInStatus: "COMPLETED" })).toBe(false);
  });
});
