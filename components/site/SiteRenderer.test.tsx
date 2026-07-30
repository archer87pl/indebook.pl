// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { buildDefaultConfig, newSection, normalizeConfig, type SiteConfig } from "@/lib/site-config";
import type { SiteWithData } from "@/lib/sites";
import SiteRenderer, { type SiteCtx } from "./SiteRenderer";

// Renderer strony WWW obiektu. Odpowiada za trzy rzeczy, których żadna
// pojedyncza sekcja nie sprawdzi za niego:
//  • KTÓRE sekcje trafiają na stronę (wyłączona ma zniknąć, nie zszarzeć),
//  • KTÓRY komponent dostaje daną sekcję — zły przypadek w switchu jest cichy,
//    bo obie sekcje wyglądają „jakoś",
//  • własny CSS właściciela przechodzi przez sanityzację, zanim trafi do <style>.
// Do tego nawigacja (kotwice tylko do sekcji, które istnieją) i stopka.

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) =>
    Object.assign((key: string, values?: Record<string, unknown>) =>
      values ? `${namespace}.${key} ${JSON.stringify(values)}` : `${namespace}.${key}`,
    ),
}));

// Sekcje mają własne testy; tu interesuje nas wyłącznie, KTÓRA z nich dostała
// KTÓRY blok konfiguracji i jaki kontekst. Atrapy są rozpisane pojedynczo,
// bo fabryka `vi.mock` jest wynoszona nad ciało pliku i nie może NICZEGO
// wywołać z jego zakresu — wolno jej tylko sięgnąć po stan z `vi.hoisted`.
const seen = vi.hoisted(() => [] as { type: string; ctx: unknown }[]);

type MarkerProps = { section?: { id: string }; ctx?: unknown };

vi.mock("./sections/Hero", () => ({
  default: ({ section, ctx }: MarkerProps) => {
    seen.push({ type: "hero", ctx });
    return <div data-section="hero" data-id={section?.id} />;
  },
}));

vi.mock("./sections/About", () => ({
  default: ({ section, ctx }: MarkerProps) => {
    seen.push({ type: "about", ctx });
    return <div data-section="about" data-id={section?.id} />;
  },
}));

vi.mock("./sections/Units", () => ({
  default: ({ section, ctx }: MarkerProps) => {
    seen.push({ type: "units", ctx });
    return <div data-section="units" data-id={section?.id} />;
  },
}));

vi.mock("./sections/Gallery", () => ({
  default: ({ section, ctx }: MarkerProps) => {
    seen.push({ type: "gallery", ctx });
    return <div data-section="gallery" data-id={section?.id} />;
  },
}));

vi.mock("./sections/Amenities", () => ({
  default: ({ section, ctx }: MarkerProps) => {
    seen.push({ type: "amenities", ctx });
    return <div data-section="amenities" data-id={section?.id} />;
  },
}));

vi.mock("./sections/Calendar", () => ({
  default: ({ section, ctx }: MarkerProps) => {
    seen.push({ type: "calendar", ctx });
    return <div data-section="calendar" data-id={section?.id} />;
  },
}));

vi.mock("./sections/Attractions", () => ({
  default: ({ section, ctx }: MarkerProps) => {
    seen.push({ type: "attractions", ctx });
    return <div data-section="attractions" data-id={section?.id} />;
  },
}));

vi.mock("./sections/Reviews", () => ({
  default: ({ section, ctx }: MarkerProps) => {
    seen.push({ type: "reviews", ctx });
    return <div data-section="reviews" data-id={section?.id} />;
  },
}));

vi.mock("./sections/Contact", () => ({
  default: ({ section, ctx }: MarkerProps) => {
    seen.push({ type: "contact", ctx });
    return <div data-section="contact" data-id={section?.id} />;
  },
}));

vi.mock("./sections/CustomHtml", () => ({
  default: ({ section, ctx }: MarkerProps) => {
    seen.push({ type: "customHtml", ctx });
    return <div data-section="customHtml" data-id={section?.id} />;
  },
}));

vi.mock("./SiteNav", () => ({ default: () => <nav data-testid="nav" /> }));
vi.mock("./SiteFooter", () => ({ default: () => <footer data-testid="footer" /> }));

vi.mock("@/lib/payments", () => ({ appUrl: () => "https://rezflow.pl" }));

const PROPERTY = {
  id: 3,
  name: "Willa Pod Dębem",
  slug: "willa",
  description: "Opis obiektu",
  address: "Zakopane",
  checkInFrom: "15:00",
  checkOutTo: "11:00",
  terms: "Regulamin",
  privacyPolicy: "",
  photos: [{ id: 91, path: "/uploads/a.jpg" }],
  faqs: [],
  unitTypes: [{ id: 7, name: "Dwuosobowy", basePriceGr: 20000 }],
} as unknown as SiteWithData["property"];

const site = (over: Partial<SiteWithData> = {}) =>
  ({
    id: 21,
    subdomain: "willa",
    template: "nadmorski",
    customCss: "",
    property: PROPERTY,
    ...over,
  }) as SiteWithData;

const config = () => buildDefaultConfig(PROPERTY as never, "nadmorski");

const renderSite = (over: { site?: SiteWithData; config?: SiteConfig; preview?: boolean } = {}) =>
  render(
    <SiteRenderer
      site={over.site ?? site()}
      config={over.config ?? config()}
      preview={over.preview}
      locale="pl"
    />,
  );

const rendered = () =>
  Array.from(document.querySelectorAll("[data-section]")).map((el) =>
    el.getAttribute("data-section"),
  );

afterEach(() => {
  cleanup();
  seen.length = 0;
});

describe("wybór sekcji", () => {
  it("renderuje sekcje z konfiguracji, w jej kolejności", () => {
    const cfg = config();

    renderSite({ config: cfg });

    expect(rendered()).toEqual(cfg.sections.filter((s) => s.enabled).map((s) => s.type));
  });

  it("wyłączona sekcja NIE trafia na stronę", () => {
    // ukrycie stylem zostawiłoby jej treść w źródle i w wyszukiwarkach
    const cfg = config();
    const hidden = cfg.sections.find((s) => s.enabled)!;
    const before = cfg.sections.filter((s) => s.enabled).length;
    hidden.enabled = false;

    renderSite({ config: cfg });

    expect(rendered()).not.toContain(hidden.type);
    expect(rendered()).toHaveLength(before - 1);
  });

  it("każdy typ sekcji trafia do swojego komponentu", () => {
    // zły przypadek w switchu jest cichy — obie sekcje „wyglądają jakoś"
    const cfg = normalizeConfig(config());
    const types = [
      "hero",
      "about",
      "units",
      "gallery",
      "amenities",
      "calendar",
      "attractions",
      "reviews",
      "contact",
      "customHtml",
    ] as const;
    cfg.sections = types.map((t) => newSection(t));

    renderSite({ config: cfg });

    expect(rendered()).toEqual([...types]);
  });

  it("sekcja niesie swoją konfigurację, nie sąsiada", () => {
    const cfg = normalizeConfig(config());
    cfg.sections = [newSection("about"), newSection("about")];

    renderSite({ config: cfg });

    const ids = Array.from(document.querySelectorAll("[data-section]")).map((el) =>
      el.getAttribute("data-id"),
    );
    expect(ids).toEqual([cfg.sections[0].id, cfg.sections[1].id]);
  });

  it("pusta lista sekcji daje stronę z samą nawigacją i stopką", () => {
    const cfg = normalizeConfig(config());
    cfg.sections = [];

    renderSite({ config: cfg });

    expect(rendered()).toEqual([]);
    expect(screen.getByTestId("nav")).toBeTruthy();
    expect(screen.getByTestId("footer")).toBeTruthy();
  });
});

describe("motyw i własny CSS", () => {
  it("paleta i font idą jako zmienne CSS na korzeń strony", () => {
    // sekcje czytają wyłącznie var(--site-*) — brak zmiennych to strona
    // bez kolorów, mimo poprawnego motywu w konfiguracji
    const { container } = renderSite();

    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue("--site-bg")).toMatch(/^#/);
    expect(root.style.getPropertyValue("--site-primary")).toMatch(/^#/);
    expect(root.style.fontFamily).toBe("var(--site-font)");
  });

  it("zmiana palety w konfiguracji zmienia zmienne", () => {
    const a = renderSite().container.firstElementChild as HTMLElement;
    const bg = a.style.getPropertyValue("--site-bg");
    cleanup();

    const cfg = config();
    cfg.theme.palette = "turkus"; // inna paleta tego samego szablonu
    const b = renderSite({ config: cfg }).container.firstElementChild as HTMLElement;

    expect(b.style.getPropertyValue("--site-bg")).not.toBe(bg);
  });

  it("bez własnego CSS nie ma pustego znacznika style", () => {
    renderSite();

    expect(document.querySelector("style")).toBeNull();
  });

  it("własny CSS trafia na stronę PO sanityzacji", () => {
    // @import ściągałby obcy arkusz z sieci na stronę gościa
    renderSite({
      site: site({ customCss: '@import url("https://evil.example/x.css"); .hero { color: red }' }),
    });

    const css = document.querySelector("style")!.innerHTML;
    expect(css).toContain(".hero");
    expect(css).not.toContain("evil.example");
  });
});

describe("kontekst przekazywany sekcjom", () => {
  const ctxOf = (type: string) => seen.find((s) => s.type === type)!.ctx as SiteCtx;

  it("podgląd jest odróżniony od strony na żywo", async () => {
    // sekcje wyłączają w podglądzie akcje zmieniające dane (np. wysyłkę
    // zapytania z formularza kontaktowego)
    renderSite({ preview: true });
    expect(ctxOf("hero").preview).toBe(true);

    cleanup();
    seen.length = 0;
    renderSite();
    expect(ctxOf("hero").preview).toBe(false);
  });

  it("sekcje dostają klucz strony, adres aplikacji i język", () => {
    // po tych trzech sekcje budują odnośniki do rezerwacji i odpytują API
    renderSite();

    expect(ctxOf("hero")).toMatchObject({
      siteKey: "willa",
      appUrl: "https://rezflow.pl",
      locale: "pl",
    });
    expect(ctxOf("hero").property.slug).toBe("willa");
  });

  it("wszystkie sekcje dostają TEN SAM kontekst", () => {
    // rozjazd między sekcjami dałby np. kalendarz pytający o cudzą stronę
    renderSite();

    const first = ctxOf("hero");
    const withCtx = seen.filter((s) => s.ctx !== undefined);
    expect(withCtx.every((s) => s.ctx === first)).toBe(true);
  });

  it("kontekst dostają tylko sekcje, które go potrzebują", () => {
    // opis, atrakcje i własny kod renderują wyłącznie swoją treść — podanie
    // im kontekstu sugerowałoby zależność, której nie ma
    const cfg = normalizeConfig(config());
    cfg.sections = ["hero", "about", "attractions", "customHtml"].map((t) =>
      newSection(t as "hero"),
    );

    renderSite({ config: cfg });

    expect(seen.filter((s) => s.ctx === undefined).map((s) => s.type)).toEqual([
      "about",
      "attractions",
      "customHtml",
    ]);
  });
});
