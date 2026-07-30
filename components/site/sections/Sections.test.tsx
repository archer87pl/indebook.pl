// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { newSection, type SiteSection } from "@/lib/site-config";
import type { SiteWithData } from "@/lib/sites";
import type { SiteCtx } from "../SiteRenderer";
import About from "./About";
import Amenities from "./Amenities";
import Attractions from "./Attractions";
import CalendarSection from "./Calendar";
import Contact from "./Contact";
import CustomHtml from "./CustomHtml";
import Gallery from "./Gallery";
import Hero from "./Hero";

// Pozostałe sekcje strony WWW. Wspólny wzorzec: sekcja bez treści ma ZNIKNĄĆ,
// a nie zostawić nagłówek nad pustką. Poza tym dwie rzeczy ważą najwięcej:
//  • About i CustomHtml wstrzykują HTML właściciela — bez sanityzacji strona
//    obiektu staje się nośnikiem cudzego skryptu,
//  • Hero i Calendar budują odnośniki do rezerwacji; pomyłka wyprowadza gościa
//    z lejka i nikt tego nie zauważy, bo strona nadal wygląda poprawnie.

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) =>
    (key: string, values?: Record<string, unknown>) =>
      values ? `${namespace}.${key} ${JSON.stringify(values)}` : `${namespace}.${key}`,
}));

vi.mock("./InquiryForm", () => ({
  default: ({ siteKey }: { siteKey: string }) => <form data-testid="inquiry" data-site={siteKey} />,
}));

vi.mock("./GalleryLightbox", () => ({
  default: ({ photos, alt }: { photos: { id: number }[]; alt: string }) => (
    <div data-testid="lightbox" data-count={photos.length} data-alt={alt} />
  ),
}));

vi.mock("./AvailabilityCalendar", () => ({
  default: ({
    unitTypes,
    appUrl,
    bookPath,
  }: {
    unitTypes: { id: number }[];
    appUrl: string;
    bookPath: string;
  }) => (
    <div
      data-testid="calendar"
      data-count={unitTypes.length}
      data-book={`${appUrl}${bookPath}`}
    />
  ),
}));

const unitType = (over: Record<string, unknown> = {}) => ({
  id: 7,
  name: "Pokój Standard",
  amenities: JSON.stringify(["wifi", "parking"]),
  photos: [],
  units: [],
  ...over,
});

const ctx = (over: Partial<SiteCtx> = {}): SiteCtx => ({
  property: {
    id: 3,
    name: "Willa Pod Dębem",
    slug: "willa",
    address: "Krupówki 1, Zakopane",
    checkInFrom: "15:00",
    checkOutTo: "11:00",
    photos: [
      { id: 91, path: "/uploads/a.jpg" },
      { id: 92, path: "/uploads/b.jpg" },
    ],
    unitTypes: [unitType()],
  } as unknown as SiteWithData["property"],
  appUrl: "https://rezflow.pl",
  preview: false,
  // subdomena strony ≠ slug obiektu; zrównanie ich w atrapie przepuszczało
  // podmianę jednego na drugie (wychwycone mutacją)
  siteKey: "willa-pod-debem",
  locale: "pl",
  ...over,
});

const withProperty = (patch: Record<string, unknown>, over: Partial<SiteCtx> = {}) => {
  const base = ctx(over);
  return {
    ...base,
    property: { ...base.property, ...patch } as unknown as SiteWithData["property"],
  };
};

const sec = <T extends SiteSection["type"]>(type: T) =>
  newSection(type) as Extract<SiteSection, { type: T }>;

afterEach(cleanup);

describe("Hero", () => {
  it("bierze zdjęcie wskazane w konfiguracji, nie pierwsze z brzegu", () => {
    const s = sec("hero");
    s.data.photoId = 92;

    render(<Hero section={s} ctx={ctx()} />);

    expect(screen.getByAltText("Willa Pod Dębem").getAttribute("src")).toBe("/uploads/b.jpg");
  });

  it("bez wskazania bierze pierwsze zdjęcie obiektu", () => {
    const s = sec("hero");
    s.data.photoId = null;

    render(<Hero section={s} ctx={ctx()} />);

    expect(screen.getByAltText("Willa Pod Dębem").getAttribute("src")).toBe("/uploads/a.jpg");
  });

  it("usunięte zdjęcie nie zostawia złamanego obrazu", () => {
    // właściciel skasował zdjęcie w panelu, a w konfiguracji został jego numer
    const s = sec("hero");
    s.data.photoId = 999;

    render(<Hero section={s} ctx={ctx()} />);

    expect(screen.getByAltText("Willa Pod Dębem").getAttribute("src")).toBe("/uploads/a.jpg");
  });

  it("obiekt bez zdjęć dostaje sam nagłówek, bez pustego obrazu", () => {
    render(<Hero section={sec("hero")} ctx={withProperty({ photos: [] })} />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("heading")).toBeTruthy();
  });

  it("pusty nagłówek zastępuje nazwa obiektu", () => {
    // strona bez tytułu wyglądałaby na niedokończoną
    const s = sec("hero");
    s.data.headline = "";

    render(<Hero section={s} ctx={ctx()} />);

    expect(screen.getByRole("heading").textContent).toBe("Willa Pod Dębem");
  });

  it("własny nagłówek wygrywa z nazwą obiektu", () => {
    const s = sec("hero");
    s.data.headline = "Góry o krok od progu";

    render(<Hero section={s} ctx={ctx()} />);

    expect(screen.getByRole("heading").textContent).toBe("Góry o krok od progu");
  });

  it("podtytuł jest opcjonalny", () => {
    const s = sec("hero");
    s.data.tagline = "";

    const { container } = render(<Hero section={s} ctx={ctx()} />);

    expect(container.querySelectorAll("p")).toHaveLength(0);
  });

  it("przycisk prowadzi do rezerwacji w języku strony", () => {
    render(<Hero section={sec("hero")} ctx={ctx({ locale: "de" })} />);

    expect(screen.getByRole("link").getAttribute("href")).toBe("https://rezflow.pl/de/o/willa");
  });

  it("pusta etykieta przycisku ma zapasową treść", () => {
    const s = sec("hero");
    s.data.ctaLabel = "";

    render(<Hero section={s} ctx={ctx()} />);

    expect(screen.getByRole("link").textContent).toBe("Zarezerwuj pobyt");
  });
});

describe("About", () => {
  it("pusta treść nie zostawia samego nagłówka", () => {
    const s = sec("about");
    s.data.html = "";

    const { container } = render(<About section={s} />);

    expect(container.innerHTML).toBe("");
  });

  it("treść właściciela idzie na stronę PO sanityzacji", () => {
    // pole jest edytowalne z panelu — bez odsiania skryptu strona obiektu
    // stałaby się nośnikiem cudzego kodu
    const s = sec("about");
    s.data.html = '<p>Zapraszamy</p><script>alert(1)</script>';

    const { container } = render(<About section={s} />);

    expect(container.innerHTML).toContain("Zapraszamy");
    expect(container.querySelector("script")).toBeNull();
  });

  it("dozwolone formatowanie zostaje", () => {
    const s = sec("about");
    s.data.html = "<p>Tekst <strong>ważny</strong></p>";

    render(<About section={s} />);

    expect(screen.getByText("ważny").tagName).toBe("STRONG");
  });
});

describe("CustomHtml", () => {
  it("pusty kod nie renderuje pustej sekcji", () => {
    const s = sec("customHtml");
    s.data.html = "   ";

    const { container } = render(<CustomHtml section={s} />);

    expect(container.innerHTML).toBe("");
  });

  it("kod właściciela też przechodzi przez sanityzację", () => {
    const s = sec("customHtml");
    s.data.html = '<div class="promo">Promocja</div><script>fetch("/x")</script>';

    const { container } = render(<CustomHtml section={s} />);

    expect(screen.getByText("Promocja")).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();
  });
});

describe("Gallery", () => {
  it("obiekt bez zdjęć nie pokazuje pustej galerii", () => {
    const { container } = render(
      <Gallery section={sec("gallery")} ctx={withProperty({ photos: [] })} />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("przekazuje wszystkie zdjęcia i nazwę obiektu jako opis", () => {
    render(<Gallery section={sec("gallery")} ctx={ctx()} />);

    const lightbox = screen.getByTestId("lightbox");
    expect(lightbox.getAttribute("data-count")).toBe("2");
    expect(lightbox.getAttribute("data-alt")).toBe("Willa Pod Dębem");
  });
});

describe("Amenities", () => {
  const renderAmenities = async (c: SiteCtx = ctx()) =>
    render(await Amenities({ section: sec("amenities"), ctx: c }));

  it("obiekt bez udogodnień nie pokazuje pustej sekcji", async () => {
    const { container } = render(
      await Amenities({
        section: sec("amenities"),
        ctx: withProperty({ unitTypes: [unitType({ amenities: "[]" })] }),
      }),
    );

    expect(container.innerHTML).toBe("");
  });

  it("sumuje udogodnienia ze WSZYSTKICH typów pokoi", async () => {
    // gość patrzy na obiekt, nie na pojedynczy pokój
    await renderAmenities(
      withProperty({
        unitTypes: [
          unitType({ amenities: JSON.stringify(["wifi"]) }),
          unitType({ id: 8, amenities: JSON.stringify(["parking"]) }),
        ],
      }),
    );

    expect(screen.getByText("common.amenities.wifi")).toBeTruthy();
    expect(screen.getByText("common.amenities.parking")).toBeTruthy();
  });

  it("udogodnienie z kilku pokoi pokazuje się raz", async () => {
    await renderAmenities(
      withProperty({
        unitTypes: [
          unitType({ amenities: JSON.stringify(["wifi"]) }),
          unitType({ id: 8, amenities: JSON.stringify(["wifi"]) }),
        ],
      }),
    );

    expect(screen.getAllByText("common.amenities.wifi")).toHaveLength(1);
  });

  it("kolejność jest stała, niezależna od kolejności pokoi", async () => {
    // lista ma wyglądać tak samo po każdej edycji pokoi
    await renderAmenities(
      withProperty({
        unitTypes: [unitType({ amenities: JSON.stringify(["parking", "wifi"]) })],
      }),
    );

    const labels = screen.getAllByText(/common.amenities\./).map((el) => el.textContent);
    expect(labels).toEqual(["common.amenities.wifi", "common.amenities.parking"]);
  });
});

describe("Attractions", () => {
  it("pusta lista nie zostawia nagłówka nad niczym", () => {
    const s = sec("attractions");
    s.data.items = [];

    const { container } = render(<Attractions section={s} />);

    expect(container.innerHTML).toBe("");
  });

  it("wypisuje nazwę, odległość i opis atrakcji", () => {
    const s = sec("attractions");
    s.data.items = [{ name: "Morskie Oko", distance: "12 km", desc: "Szlak z Palenicy" }];

    render(<Attractions section={s} />);

    expect(screen.getByText("Morskie Oko")).toBeTruthy();
    expect(screen.getByText("12 km")).toBeTruthy();
    expect(screen.getByText("Szlak z Palenicy")).toBeTruthy();
  });

  it("odległość i opis są opcjonalne", () => {
    const s = sec("attractions");
    s.data.items = [{ name: "Rynek", distance: "", desc: "" }];

    const { container } = render(<Attractions section={s} />);

    expect(screen.getByText("Rynek")).toBeTruthy();
    expect(container.querySelectorAll("p")).toHaveLength(0);
    expect(container.querySelectorAll("span")).toHaveLength(0);
  });
});

describe("Calendar", () => {
  const renderCalendar = async (c: SiteCtx = ctx()) =>
    render(await CalendarSection({ section: sec("calendar"), ctx: c }));

  it("obiekt bez pokoi nie pokazuje kalendarza bez czego wybierać", async () => {
    const { container } = render(
      await CalendarSection({ section: sec("calendar"), ctx: withProperty({ unitTypes: [] }) }),
    );

    expect(container.innerHTML).toBe("");
  });

  it("rezerwacja z kalendarza trafia do aplikacji w języku strony", async () => {
    await renderCalendar(ctx({ locale: "en" }));

    expect(screen.getByTestId("calendar").getAttribute("data-book")).toBe(
      "https://rezflow.pl/en/rezerwuj",
    );
  });

  it("przekazuje wszystkie typy pokoi do wyboru", async () => {
    await renderCalendar(
      withProperty({ unitTypes: [unitType(), unitType({ id: 8, name: "Apartament" })] }),
    );

    expect(screen.getByTestId("calendar").getAttribute("data-count")).toBe("2");
  });
});

describe("Contact", () => {
  const renderContact = async (c: SiteCtx = ctx()) =>
    render(await Contact({ section: sec("contact"), ctx: c }));

  it("formularz zapytania wie, której strony dotyczy", async () => {
    // bez klucza strony zapytanie nie trafiłoby do właściwego obiektu
    await renderContact();

    expect(screen.getByTestId("inquiry").getAttribute("data-site")).toBe("willa-pod-debem");
  });

  it("pokazuje adres i godziny meldunku", async () => {
    await renderContact();

    expect(screen.getByText("Krupówki 1, Zakopane")).toBeTruthy();
    expect(screen.getByText(/site.contact.checkInOut.*15:00.*11:00/)).toBeTruthy();
  });

  it("mapa pokazuje się dla adresu obiektu", async () => {
    const { container } = await renderContact();

    const map = container.querySelector("iframe")!;
    expect(map.getAttribute("src")).toContain(encodeURIComponent("Krupówki 1, Zakopane"));
  });

  it("bez adresu nie ma mapy prowadzącej donikąd", async () => {
    const { container } = render(
      await Contact({ section: sec("contact"), ctx: withProperty({ address: "" }) }),
    );

    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getByTestId("inquiry")).toBeTruthy();
  });

  it("wstęp jest opcjonalny", async () => {
    const s = sec("contact");
    s.data.intro = "";

    const { container } = render(await Contact({ section: s, ctx: ctx() }));

    expect(container.querySelectorAll("p.text-center")).toHaveLength(0);
  });
});
