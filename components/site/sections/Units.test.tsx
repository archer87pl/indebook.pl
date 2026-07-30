// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { newSection, type SiteSection } from "@/lib/site-config";
import type { SiteWithData } from "@/lib/sites";
import type { SiteCtx } from "../SiteRenderer";
import Units from "./Units";
import Reviews from "./Reviews";

// Dwie sekcje strony WWW, które pokazują DANE z RezFlow, a nie tekst wpisany
// w kreatorze. Obie mają ten sam cichy tryb awarii: brak danych ma oznaczać
// brak sekcji, a nie nagłówek nad pustką. Poza tym:
//  • Units buduje odnośnik do rezerwacji — pomyłka wyprowadza gościa z lejka,
//  • Reviews liczy średnią i rysuje gwiazdki; zła średnia to reklama wprost.

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) =>
    (key: string, values?: Record<string, unknown>) =>
      values ? `${namespace}.${key} ${JSON.stringify(values)}` : `${namespace}.${key}`,
}));

const db = vi.hoisted(() => {
  const calls: unknown[] = [];
  const rows: { reviews: { id: number; rating: number; authorName: string; comment: string; createdAt: Date }[] } =
    { reviews: [] };
  return { calls, rows };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    review: {
      findMany: (args: unknown) => {
        db.calls.push(args);
        return Promise.resolve(db.rows.reviews);
      },
    },
  },
}));

const unitType = (over: Record<string, unknown> = {}) => ({
  id: 7,
  name: "Pokój Standard",
  description: "Widok na góry",
  basePriceGr: 28000,
  maxGuests: 2,
  minStay: 1,
  amenities: JSON.stringify(["wifi", "parking"]),
  photos: [{ id: 91, path: "/uploads/a.jpg" }],
  units: [],
  ...over,
});

const ctx = (over: Partial<SiteCtx> = {}): SiteCtx => ({
  property: {
    id: 3,
    name: "Willa Pod Dębem",
    slug: "willa",
    unitTypes: [unitType()],
  } as unknown as SiteWithData["property"],
  appUrl: "https://rezflow.pl",
  preview: false,
  siteKey: "willa",
  locale: "pl",
  ...over,
});

const withUnitTypes = (unitTypes: ReturnType<typeof unitType>[], over: Partial<SiteCtx> = {}) => {
  const base = ctx(over);
  return { ...base, property: { ...base.property, unitTypes } as unknown as typeof base.property };
};

const unitsSection = () => newSection("units") as Extract<SiteSection, { type: "units" }>;
const reviewsSection = () => newSection("reviews") as Extract<SiteSection, { type: "reviews" }>;

const review = (over: Record<string, unknown> = {}) => ({
  id: 1,
  rating: 5,
  authorName: "Anna",
  comment: "Świetnie!",
  createdAt: new Date("2026-06-15T10:00:00Z"),
  ...over,
});

afterEach(cleanup);

describe("Units", () => {
  const renderUnits = async (c: SiteCtx = ctx()) =>
    render(await Units({ section: unitsSection(), ctx: c }));

  it("obiekt bez typów pokoi nie pokazuje pustej sekcji", async () => {
    // nagłówek „Nasze pokoje" nad niczym wygląda na zepsutą stronę
    const { container } = render(await Units({ section: unitsSection(), ctx: withUnitTypes([]) }));

    expect(container.innerHTML).toBe("");
  });

  it("każdy typ pokoju dostaje kartę z nazwą i ceną", async () => {
    await renderUnits();

    expect(screen.getByText("Pokój Standard")).toBeTruthy();
    expect(screen.getByText(/280/)).toBeTruthy();
  });

  it("odnośnik prowadzi do TEGO pokoju w aplikacji", async () => {
    // strona WWW to wizytówka; rezerwacja odbywa się pod adresem aplikacji
    await renderUnits();

    expect(screen.getByRole("link", { name: "site.units.seeAndBook" }).getAttribute("href")).toBe(
      "https://rezflow.pl/o/willa/pokoj/7",
    );
  });

  it("odnośnik zachowuje język strony", async () => {
    await renderUnits(ctx({ locale: "en" }));

    expect(screen.getByRole("link", { name: "site.units.seeAndBook" }).getAttribute("href")).toBe(
      "https://rezflow.pl/en/o/willa/pokoj/7",
    );
  });

  it("pokazuje pojemność pokoju", async () => {
    await renderUnits(withUnitTypes([unitType({ maxGuests: 4 })]));

    expect(screen.getByText(/site.units.upTo.*"count":4/)).toBeTruthy();
  });

  it("minimalny pobyt pokazuje się dopiero, gdy realnie ogranicza", async () => {
    // „min. pobyt: 1 noc" to informacja o niczym
    await renderUnits(withUnitTypes([unitType({ minStay: 1 })]));
    expect(screen.queryByText(/minStay/)).toBeNull();

    cleanup();
    await renderUnits(withUnitTypes([unitType({ minStay: 3 })]));
    expect(screen.getByText(/site.units.minStay.*"count":3/)).toBeTruthy();
  });

  it("pierwsze zdjęcie typu pokoju jest podpisane jego nazwą", async () => {
    await renderUnits();

    expect(screen.getByAltText("Pokój Standard").getAttribute("src")).toBe("/uploads/a.jpg");
  });

  it("pokój bez zdjęcia dostaje kafel zastępczy, nie pusty obraz", async () => {
    // złamana ikona zdjęcia wygląda gorzej niż szare tło
    await renderUnits(withUnitTypes([unitType({ photos: [] })]));

    expect(screen.queryByRole("img")).toBeNull();
  });

  it("pokazuje tylko udogodnienia faktycznie zaznaczone", async () => {
    await renderUnits(withUnitTypes([unitType({ amenities: JSON.stringify(["wifi"]) })]));

    expect(screen.getByText(/common.amenities.wifi/)).toBeTruthy();
    expect(screen.queryByText(/common.amenities.parking/)).toBeNull();
  });

  it("lista udogodnień jest ucięta do pięciu, żeby nie rozpychać karty", async () => {
    await renderUnits(
      withUnitTypes([
        unitType({
          amenities: JSON.stringify([
            "wifi",
            "parking",
            "tv",
            "ac",
            "washer",
            "balcony",
            "fridge",
          ]),
        }),
      ]),
    );

    expect(screen.getAllByText(/common.amenities\./)).toHaveLength(5);
  });

  it("brak udogodnień nie zostawia pustego wiersza", async () => {
    await renderUnits(withUnitTypes([unitType({ amenities: "[]" })]));

    expect(screen.queryByText(/common.amenities\./)).toBeNull();
  });

  it("opis pokoju jest opcjonalny", async () => {
    // sprawdzamy OBECNOŚĆ akapitu, nie jego treść: pusty opis renderowany bez
    // wartości zostawia niewidoczny akapit, którego wyszukiwanie po tekście
    // nie wychwyci (wychwycone mutacją)
    const withText = await Units({ section: unitsSection(), ctx: ctx() });
    const { container } = render(withText);
    expect(container.querySelectorAll("p.line-clamp-3")).toHaveLength(1);

    cleanup();
    const empty = await Units({
      section: unitsSection(),
      ctx: withUnitTypes([unitType({ description: "" })]),
    });
    expect(render(empty).container.querySelectorAll("p.line-clamp-3")).toHaveLength(0);
  });

  it("kilka typów pokoi daje kilka kart", async () => {
    await renderUnits(
      withUnitTypes([unitType(), unitType({ id: 8, name: "Apartament", photos: [] })]),
    );

    expect(screen.getAllByRole("link", { name: "site.units.seeAndBook" })).toHaveLength(2);
    expect(screen.getByText("Apartament")).toBeTruthy();
  });
});

describe("Reviews", () => {
  const renderReviews = async (c: SiteCtx = ctx()) =>
    render(await Reviews({ section: reviewsSection(), ctx: c }));

  beforeEach(() => {
    db.calls.length = 0;
    db.rows.reviews = [review()];
  });

  it("pyta o opinie TEGO obiektu, pomijając ukryte", async () => {
    // ukryta opinia to decyzja recepcji — pokazanie jej na stronie WWW
    // obchodziłoby moderację
    await renderReviews();

    expect(db.calls).toEqual([
      {
        where: { propertyId: 3, hidden: false },
        orderBy: { createdAt: "desc" },
        take: 9,
      },
    ]);
  });

  it("obiekt bez opinii nie pokazuje pustej sekcji", async () => {
    db.rows.reviews = [];

    const { container } = render(await Reviews({ section: reviewsSection(), ctx: ctx() }));

    expect(container.innerHTML).toBe("");
  });

  it("liczy średnią ocenę i podaje liczbę opinii", async () => {
    db.rows.reviews = [review({ id: 1, rating: 5 }), review({ id: 2, rating: 4 })];

    await renderReviews();

    expect(screen.getByText(/"avg":"4,5".*"count":2/)).toBeTruthy();
  });

  it("średnia jest po polsku, z przecinkiem", async () => {
    db.rows.reviews = [review({ id: 1, rating: 5 }), review({ id: 2, rating: 4 })];

    await renderReviews();

    expect(screen.getByText(/"avg":"4,5"/)).toBeTruthy();
    expect(screen.queryByText(/"avg":"4\.5"/)).toBeNull();
  });

  it("gwiazdki podsumowania są zaokrąglone do pełnej", async () => {
    // średnia 4,4 to CZTERY wypełnione gwiazdki. Bez zaokrąglenia „i < 4,4"
    // wypełniałoby piątą — obiekt reklamowałby się kompletę ocen, którego
    // nie ma (różnica widoczna dopiero przy średniej poniżej połówki)
    db.rows.reviews = [
      review({ id: 1, rating: 5 }),
      review({ id: 2, rating: 5 }),
      review({ id: 3, rating: 4 }),
      review({ id: 4, rating: 4 }),
      review({ id: 5, rating: 4 }),
    ];

    const { container } = render(await Reviews({ section: reviewsSection(), ctx: ctx() }));

    const summary = container.querySelector('[aria-label="4.4 / 5"]')!;
    expect(summary.querySelectorAll('svg[fill="currentColor"]')).toHaveLength(4);
  });

  it("ocena pojedynczej opinii wypełnia dokładnie tyle gwiazdek, ile ma", async () => {
    db.rows.reviews = [review({ rating: 3 })];

    const { container } = render(await Reviews({ section: reviewsSection(), ctx: ctx() }));

    const stars = container.querySelectorAll('[aria-label="3 / 5"]');
    expect(stars[stars.length - 1].querySelectorAll('svg[fill="currentColor"]')).toHaveLength(3);
  });

  it("każda opinia ma autora, ocenę i datę", async () => {
    await renderReviews();

    expect(screen.getByText("Anna")).toBeTruthy();
    expect(screen.getAllByLabelText("5 / 5").length).toBeGreaterThan(0);
    expect(screen.getByText(/15/)).toBeTruthy();
  });

  it("opinia bez komentarza pokazuje samą ocenę", async () => {
    // znowu obecność akapitu, nie treść — pusty `<p>` po opinii wygląda
    // jak ucięta treść
    const { container } = render(await Reviews({ section: reviewsSection(), ctx: ctx() }));
    expect(container.querySelectorAll("p.whitespace-pre-line")).toHaveLength(1);

    cleanup();
    db.rows.reviews = [review({ comment: "" })];
    const bare = render(await Reviews({ section: reviewsSection(), ctx: ctx() }));
    expect(bare.container.querySelectorAll("p.whitespace-pre-line")).toHaveLength(0);
    expect(within(bare.container).getByText("Anna")).toBeTruthy();
  });

  it("łamanie linii z komentarza jest zachowane", async () => {
    db.rows.reviews = [review({ comment: "Linia 1\nLinia 2" })];

    await renderReviews();

    expect(screen.getByText(/Linia 1/).className).toContain("whitespace-pre-line");
  });

  it("wszystkie pobrane opinie trafiają na stronę", async () => {
    db.rows.reviews = [review({ id: 1 }), review({ id: 2, authorName: "Piotr" })];

    const { container } = await renderReviews();

    expect(within(container).getByText("Anna")).toBeTruthy();
    expect(within(container).getByText("Piotr")).toBeTruthy();
  });
});
