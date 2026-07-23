import { describe, expect, it } from "vitest";
import { hashPassword, safeEqual, verifyPassword } from "./password";

describe("hashPassword / verifyPassword", () => {
  it("weryfikuje poprawne hasło i odrzuca błędne", () => {
    const h = hashPassword("tajne-haslo-123");
    expect(verifyPassword("tajne-haslo-123", h)).toBe(true);
    expect(verifyPassword("zle", h)).toBe(false);
  });

  it("różne sole dają różne hashe tego samego hasła", () => {
    expect(hashPassword("x")).not.toBe(hashPassword("x"));
  });

  it("uszkodzony rekord nie wywala się, tylko zwraca false", () => {
    expect(verifyPassword("x", "bezdwukropka")).toBe(false);
  });
});

describe("safeEqual", () => {
  it("true dla identycznych, false dla różnych i różnej długości", () => {
    expect(safeEqual("abc123", "abc123")).toBe(true);
    expect(safeEqual("abc123", "abc124")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});
