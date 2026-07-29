import { describe, expect, it, vi } from "vitest";

// Slug obiektu ląduje w publicznym adresie (/o/willa-pod-debem) i musi być
// unikalny w całej platformie — dwa obiekty o tej samej nazwie nie mogą
// przykryć sobie strony.

const existingSlugs = new Set<string>();

vi.mock("./db", () => ({
  prisma: {
    property: {
      findUnique: async ({ where }: { where: { slug: string } }) =>
        existingSlugs.has(where.slug) ? { id: 1, slug: where.slug } : null,
    },
  },
}));

const { slugify, uniquePropertySlug } = await import("./slug");

describe("slugify", () => {
  it("polskie znaki schodzą do ASCII", () => {
    expect(slugify("Willa Zażółć Gęślą Jaźń")).toBe("willa-zazolc-gesla-jazn");
  });

  it("ł i Ł mają osobną obsługę, bo nie rozkładają się w NFD", () => {
    // „ł" to jedna litera, nie „l" + znak diakrytyczny — normalizacja jej nie ruszy
    expect(slugify("Domek Łomża")).toBe("domek-lomza");
    expect(slugify("ŁÓDŹ")).toBe("lodz");
  });

  it("spacje, interpunkcja i znaki specjalne stają się pojedynczym myślnikiem", () => {
    expect(slugify("Apartament   „Nad  Morzem\" (2025)!")).toBe("apartament-nad-morzem-2025");
  });

  it("nie zostawia myślnika na początku ani na końcu", () => {
    expect(slugify("  — Pokoje u Ani —  ")).toBe("pokoje-u-ani");
  });

  it("nazwa bez liter ASCII degraduje do „obiekt”, zamiast dać pusty adres", () => {
    expect(slugify("!!!")).toBe("obiekt");
    expect(slugify("")).toBe("obiekt");
    expect(slugify("日本の宿")).toBe("obiekt");
  });

  it("długa nazwa jest ucinana do 48 znaków", () => {
    const slug = slugify("A".repeat(80));
    expect(slug).toHaveLength(48);
  });

  it("cyfry i istniejące myślniki przechodzą bez zmian", () => {
    expect(slugify("Hotel 4-Pory-Roku")).toBe("hotel-4-pory-roku");
  });
});

describe("uniquePropertySlug", () => {
  it("wolna nazwa daje slug wprost z nazwy", async () => {
    existingSlugs.clear();
    expect(await uniquePropertySlug("Willa Pod Dębem")).toBe("willa-pod-debem");
  });

  it("zajęty slug dostaje kolejny numer", async () => {
    existingSlugs.clear();
    existingSlugs.add("willa-pod-debem");
    expect(await uniquePropertySlug("Willa Pod Dębem")).toBe("willa-pod-debem-2");
  });

  it("numeruje dalej, dopóki nie trafi na wolny", async () => {
    existingSlugs.clear();
    for (const s of ["willa", "willa-2", "willa-3"]) existingSlugs.add(s);
    expect(await uniquePropertySlug("Willa")).toBe("willa-4");
  });
});
