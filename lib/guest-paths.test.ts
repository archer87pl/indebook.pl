import { describe, expect, it } from "vitest";
import { isGuestPath, stripLocalePrefix } from "./guest-paths";

describe("stripLocalePrefix", () => {
  it("zdejmuje prefiks języka innego niż domyślny", () => {
    expect(stripLocalePrefix("/en/o/willa")).toBe("/o/willa");
    expect(stripLocalePrefix("/de/rezerwuj/1")).toBe("/rezerwuj/1");
  });
  it("nie rusza ścieżek bez prefiksu (PL domyślny)", () => {
    expect(stripLocalePrefix("/o/willa")).toBe("/o/willa");
    expect(stripLocalePrefix("/admin")).toBe("/admin");
  });
  it("nie myli prefiksu z fragmentem sluga", () => {
    expect(stripLocalePrefix("/ends-with-en")).toBe("/ends-with-en");
    expect(stripLocalePrefix("/enigma/o/x")).toBe("/enigma/o/x");
  });
});

describe("isGuestPath", () => {
  it("trasy gościa — z prefiksem i bez", () => {
    for (const p of [
      "/o/willa",
      "/en/o/willa",
      "/de/o/willa/pokoj/1",
      "/o/willa/wyniki",
      "/rezerwuj/1",
      "/en/rezerwuj/1",
      "/r/HO-ABC",
      "/r/HO-ABC/meldunek",
      "/moja-rezerwacja",
    ]) {
      expect(isGuestPath(p), p).toBe(true);
    }
  });

  it("panel, superadmin, landing, blog i auth — nie", () => {
    for (const p of ["/", "/admin", "/admin/kanaly", "/superadmin", "/login", "/rejestracja", "/blog", "/blog/wpis"]) {
      expect(isGuestPath(p), p).toBe(false);
    }
  });
});
