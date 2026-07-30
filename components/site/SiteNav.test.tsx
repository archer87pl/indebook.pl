// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { buildDefaultConfig, newSection, normalizeConfig, type SiteConfig } from "@/lib/site-config";
import type { SiteWithData } from "@/lib/sites";
import type { SiteCtx } from "./SiteRenderer";
import SiteNav from "./SiteNav";
import SiteFooter from "./SiteFooter";

// Rama strony WWW obiektu: nawigacja i stopka. Obie są komponentami
// SERWEROWYMI i obie budują odnośniki do aplikacji — pomyłka w nich wyprowadza
// gościa poza rezerwację (albo do pustej podstrony), i to bez żadnego błędu.

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) =>
    (key: string, values?: Record<string, unknown>) =>
      values ? `${namespace}.${key} ${JSON.stringify(values)}` : `${namespace}.${key}`,
}));

vi.mock("./SiteLangSwitcher", () => ({ default: () => null }));

const PROPERTY = {
  id: 3,
  name: "Willa Pod Dębem",
  slug: "willa",
  description: "Opis obiektu nad morzem.",
  address: "Zakopane",
  checkInFrom: "15:00",
  checkOutTo: "11:00",
  terms: "Regulamin",
  privacyPolicy: "",
  photos: [],
  faqs: [],
  unitTypes: [],
} as unknown as SiteWithData["property"];

const ctx: SiteCtx = {
  property: PROPERTY,
  appUrl: "https://rezflow.pl",
  preview: false,
  siteKey: "willa",
  locale: "pl",
};

const config = () => buildDefaultConfig(PROPERTY as never, "nadmorski");

afterEach(cleanup);

describe("SiteNav", () => {
  const renderNav = async (cfg: SiteConfig) =>
    render(await SiteNav({ config: cfg, ctx }));

  it("kotwice prowadzą tylko do sekcji, które są na stronie", async () => {
    // odnośnik do wyłączonej sekcji przewijałby donikąd
    const cfg = normalizeConfig(config());
    cfg.sections = [newSection("about"), newSection("gallery")];
    cfg.sections[1].enabled = false;

    await renderNav(cfg);

    expect(screen.getByRole("link", { name: "site.nav.about" }).getAttribute("href")).toBe("#about");
    expect(screen.queryByRole("link", { name: "site.nav.gallery" })).toBeNull();
  });

  it("nagłówek i własny kod nie dostają kotwic — nie ma do czego wracać", async () => {
    const cfg = normalizeConfig(config());
    cfg.sections = [newSection("hero"), newSection("customHtml"), newSection("units")];

    await renderNav(cfg);

    const anchors = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"))
      .filter((h) => h?.startsWith("#"));
    expect(anchors).toEqual(["#top", "#units"]);
  });

  it("bez logo pokazuje nazwę obiektu", async () => {
    await renderNav(config());

    expect(screen.getByText("Willa Pod Dębem")).toBeTruthy();
  });

  it("z logo pokazuje obraz opisany nazwą obiektu", async () => {
    const cfg = config();
    cfg.theme.logoUrl = "/uploads/logo.png";

    await renderNav(cfg);

    const img = screen.getByAltText("Willa Pod Dębem") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/uploads/logo.png");
  });

  it("rezerwacja prowadzi do aplikacji, nie do kotwicy na stronie", async () => {
    // strona WWW jest wizytówką; silnik rezerwacji stoi pod adresem aplikacji
    await renderNav(config());

    expect(screen.getByRole("link", { name: "site.book" }).getAttribute("href")).toBe(
      "https://rezflow.pl/o/willa",
    );
  });

  it("rezerwacja kontynuuje język strony", async () => {
    // gość czytający po angielsku ma dostać angielski formularz
    render(await SiteNav({ config: config(), ctx: { ...ctx, locale: "en" } }));

    expect(screen.getByRole("link", { name: "site.book" }).getAttribute("href")).toBe(
      "https://rezflow.pl/en/o/willa",
    );
  });
});

describe("SiteFooter", () => {
  it("pokazuje godziny meldunku z danych obiektu", async () => {
    render(await SiteFooter({ ctx }));

    expect(screen.getByText(/site.footer.checkInFrom.*15:00/)).toBeTruthy();
    expect(screen.getByText(/site.footer.checkOutTo.*11:00/)).toBeTruthy();
  });

  it("odnośnik do regulaminu pojawia się, gdy jest co pokazać", async () => {
    render(await SiteFooter({ ctx }));

    expect(screen.getByRole("link", { name: "site.footer.terms" }).getAttribute("href")).toBe(
      "https://rezflow.pl/o/willa/regulamin",
    );
  });

  it("bez regulaminu i polityki nie ma odnośnika prowadzącego do pustej strony", async () => {
    const bare = { ...PROPERTY, terms: "", privacyPolicy: "" };

    render(await SiteFooter({ ctx: { ...ctx, property: bare } }));

    expect(screen.queryByRole("link", { name: "site.footer.terms" })).toBeNull();
  });

  it("sama polityka prywatności też wystarcza", async () => {
    const onlyPolicy = { ...PROPERTY, terms: "", privacyPolicy: "Polityka" };

    render(await SiteFooter({ ctx: { ...ctx, property: onlyPolicy } }));

    expect(screen.getByRole("link", { name: "site.footer.terms" })).toBeTruthy();
  });

  it("adres pokazuje się tylko wtedy, gdy jest uzupełniony", async () => {
    render(await SiteFooter({ ctx }));
    expect(screen.getByText("Zakopane")).toBeTruthy();

    cleanup();
    render(await SiteFooter({ ctx: { ...ctx, property: { ...PROPERTY, address: "" } } }));
    expect(screen.queryByText("Zakopane")).toBeNull();
  });
});
