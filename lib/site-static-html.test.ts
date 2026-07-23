import { describe, expect, it } from "vitest";
import { newSection } from "./site-config";
import { renderSectionHtml } from "./site-static-html";

const ctx = {
  property: {
    name: "Willa Test",
    description: "Opis obiektu.",
    address: "ul. Prosta 1, Testowo",
  },
};

describe("renderSectionHtml — statyczny HTML przy odpinaniu sekcji", () => {
  it("hero: nagłówek i hasło trafiają do HTML", () => {
    const s = newSection("hero");
    if (s.type === "hero") {
      s.data.headline = "Witaj w Willi";
      s.data.tagline = "Nad samym jeziorem";
    }
    const html = renderSectionHtml(s, ctx);
    expect(html).toContain("Witaj w Willi");
    expect(html).toContain("Nad samym jeziorem");
    expect(html).toMatch(/<h1|<h2/);
  });

  it("about: tytuł i treść (HTML przechodzi bez escapowania)", () => {
    const s = newSection("about");
    if (s.type === "about") {
      s.data.title = "O nas";
      s.data.html = "<p>Rodzinny <b>pensjonat</b>.</p>";
    }
    const html = renderSectionHtml(s, ctx);
    expect(html).toContain("O nas");
    expect(html).toContain("<b>pensjonat</b>");
  });

  it("attractions: pozycje listy z nazwą i odległością", () => {
    const s = newSection("attractions");
    if (s.type === "attractions") {
      s.data.items = [{ name: "Jezioro", desc: "Plaża i pomost", distance: "300 m" }];
    }
    const html = renderSectionHtml(s, ctx);
    expect(html).toContain("Jezioro");
    expect(html).toContain("300 m");
  });

  it("sekcje danych (units/calendar): informacyjny placeholder zamiast danych na żywo", () => {
    const html = renderSectionHtml(newSection("units"), ctx);
    expect(html.length).toBeGreaterThan(20);
  });

  it("escapuje treści tekstowe (bez wstrzyknięcia tagów z pól tekstowych)", () => {
    const s = newSection("hero");
    if (s.type === "hero") s.data.headline = "<script>zle()</script>";
    const html = renderSectionHtml(s, ctx);
    expect(html).not.toContain("<script>");
  });
});
