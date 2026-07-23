import { describe, expect, it } from "vitest";
import {
  buildDefaultConfig,
  newSection,
  normalizeConfig,
  SECTION_LABELS,
  sid,
  type SiteConfig,
} from "./site-config";

const propertyFixture = {
  name: "Willa Testowa",
  description: "Przytulna willa nad jeziorem.",
  address: "ul. Testowa 1, 00-001 Testowo",
  slug: "willa-testowa",
  photos: [{ id: 11 }, { id: 12 }],
  unitTypes: [{ id: 1 }, { id: 2 }],
};

describe("normalizeConfig", () => {
  it("z pustego obiektu buduje pełną konfigurację z defaultami", () => {
    const cfg = normalizeConfig({});
    expect(cfg.theme.palette).toBeTruthy();
    expect(cfg.theme.font).toBeTruthy();
    expect(cfg.theme.logoUrl).toBeNull();
    expect(cfg.seo).toEqual({ title: "", description: "" });
    expect(Array.isArray(cfg.sections)).toBe(true);
  });

  it("odrzuca sekcje nieznanego typu (forward-compat)", () => {
    const cfg = normalizeConfig({
      sections: [
        { id: "a", type: "hero", enabled: true, data: {} },
        { id: "b", type: "cosnowego", enabled: true, data: {} },
      ],
    });
    expect(cfg.sections.map((s) => s.type)).toEqual(["hero"]);
  });

  it("uzupełnia brakujące pola danych sekcji defaultami", () => {
    const cfg = normalizeConfig({
      sections: [{ id: "a", type: "hero", enabled: true, data: { headline: "Hej" } }],
    });
    const hero = cfg.sections[0];
    expect(hero.type).toBe("hero");
    if (hero.type === "hero") {
      expect(hero.data.headline).toBe("Hej");
      expect(hero.data.ctaLabel).toBeTruthy();
    }
  });

  it("toleruje kompletne śmieci na wejściu", () => {
    for (const raw of [null, undefined, 42, "x", [], { sections: "nie-tablica" }]) {
      const cfg = normalizeConfig(raw);
      expect(cfg.sections).toBeDefined();
      expect(cfg.theme).toBeDefined();
    }
  });
});

describe("buildDefaultConfig", () => {
  it("prefilluje dane obiektu i włącza sekcje danych", () => {
    const cfg: SiteConfig = buildDefaultConfig(propertyFixture, "gorski");
    const hero = cfg.sections.find((s) => s.type === "hero");
    expect(hero?.enabled).toBe(true);
    if (hero?.type === "hero") expect(hero.data.headline).toContain("Willa Testowa");
    const about = cfg.sections.find((s) => s.type === "about");
    if (about?.type === "about") expect(about.data.html).toContain("Przytulna willa");
    for (const t of ["units", "gallery", "amenities", "calendar", "reviews", "contact"]) {
      expect(cfg.sections.find((s) => s.type === t)?.enabled).toBe(true);
    }
  });

  it("atrakcje startują wyłączone i puste, brak sekcji customHtml", () => {
    const cfg = buildDefaultConfig(propertyFixture, "nadmorski");
    const attr = cfg.sections.find((s) => s.type === "attractions");
    expect(attr?.enabled).toBe(false);
    if (attr?.type === "attractions") expect(attr.data.items).toEqual([]);
    expect(cfg.sections.find((s) => s.type === "customHtml")).toBeUndefined();
  });

  it("nieznany szablon nie wywala — fallback na uniwersalny", () => {
    const cfg = buildDefaultConfig(propertyFixture, "nie-ma-takiego");
    expect(cfg.theme.palette).toBeTruthy();
  });
});

describe("newSection / sid / SECTION_LABELS", () => {
  it("newSection(attractions) ma puste items i unikalne id", () => {
    const a = newSection("attractions");
    const b = newSection("attractions");
    if (a.type === "attractions") expect(a.data.items).toEqual([]);
    expect(a.id).not.toBe(b.id);
  });

  it("każdy typ sekcji ma polską etykietę", () => {
    for (const t of [
      "hero", "about", "units", "gallery", "amenities",
      "calendar", "attractions", "reviews", "contact", "customHtml",
    ] as const) {
      expect(SECTION_LABELS[t]).toBeTruthy();
    }
  });

  it("sid generuje krótkie unikalne identyfikatory", () => {
    const ids = new Set(Array.from({ length: 100 }, () => sid()));
    expect(ids.size).toBe(100);
  });
});
