import { describe, expect, it } from "vitest";
import {
  findPalette,
  SITE_FONTS,
  SITE_TEMPLATES,
  siteTemplate,
  themeVars,
} from "./site-themes";

describe("SITE_TEMPLATES — spójność danych", () => {
  it("są 4 szablony, każdy z ≥3 paletami i poprawnymi defaultami", () => {
    expect(SITE_TEMPLATES).toHaveLength(4);
    for (const t of SITE_TEMPLATES) {
      expect(t.palettes.length).toBeGreaterThanOrEqual(3);
      expect(t.palettes.some((p) => p.key === t.defaultPalette)).toBe(true);
      expect(t.defaultFont in SITE_FONTS).toBe(true);
    }
  });

  it("wszystkie kolory palet to poprawne hexy", () => {
    for (const t of SITE_TEMPLATES) {
      for (const p of t.palettes) {
        for (const c of [p.bg, p.surface, p.text, p.muted, p.primary, p.primaryText, p.accent]) {
          expect(c).toMatch(/^#[0-9a-f]{6}$/i);
        }
      }
    }
  });

  it("klucze palet są unikalne w obrębie szablonu", () => {
    for (const t of SITE_TEMPLATES) {
      const keys = t.palettes.map((p) => p.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe("siteTemplate / findPalette — fallbacki", () => {
  it("nieznany szablon → uniwersalny", () => {
    expect(siteTemplate("nie-ma").key).toBe("uniwersalny");
    expect(siteTemplate("gorski").key).toBe("gorski");
  });

  it("nieznana paleta → pierwsza paleta szablonu", () => {
    expect(findPalette("gorski", "las").key).toBe("las");
    expect(findPalette("gorski", "xxx").key).toBe(siteTemplate("gorski").palettes[0].key);
    expect(findPalette("xxx", "yyy").key).toBe(siteTemplate("uniwersalny").palettes[0].key);
  });
});

describe("themeVars", () => {
  it("zwraca komplet zmiennych --site-* z wartościami palety i fontu", () => {
    const vars = themeVars({ palette: "las", font: "serif" }, "gorski");
    const palette = findPalette("gorski", "las");
    expect(vars["--site-bg"]).toBe(palette.bg);
    expect(vars["--site-primary"]).toBe(palette.primary);
    expect(vars["--site-primary-text"]).toBe(palette.primaryText);
    expect(vars["--site-accent"]).toBe(palette.accent);
    expect(vars["--site-font"]).toBe(SITE_FONTS.serif.css);
    for (const key of [
      "--site-bg", "--site-surface", "--site-text", "--site-muted",
      "--site-primary", "--site-primary-text", "--site-accent", "--site-font",
    ]) {
      expect(vars[key]).toBeTruthy();
    }
  });

  it("nieznany font → stos sans (bez wywrotki renderera)", () => {
    const vars = themeVars({ palette: "las", font: "nie-ma" }, "gorski");
    expect(vars["--site-font"]).toBe(SITE_FONTS.sans.css);
  });
});
