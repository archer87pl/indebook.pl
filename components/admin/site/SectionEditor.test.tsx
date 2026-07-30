// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { Photo } from "@prisma/client";
import { buildDefaultConfig, normalizeConfig, newSection, SECTION_LABELS } from "@/lib/site-config";
import SectionEditor from "./SectionEditor";

// Edytor sekcji strony WWW. To komponent serwerowy bez stanu, więc logika
// sprowadza się do trzech rzeczy, a każda ma konsekwencję dla właściciela:
// jakie POLA dostaje dana sekcja (inne dla nagłówka, inne dla galerii),
// które strzałki są zablokowane na końcach listy oraz kiedy pokazuje się
// nieodwracalne „odepnij" — z ostrzeżeniem, a nie od razu z przyciskiem.

vi.mock("@/lib/site-actions", () => ({
  addSiteSection: vi.fn(),
  convertSectionToHtml: vi.fn(),
  moveSiteSection: vi.fn(),
  removeSiteSection: vi.fn(),
  toggleSiteSection: vi.fn(),
  updateSiteSection: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const PHOTOS = [
  { id: 91, path: "/uploads/a.jpg" },
  { id: 92, path: "/uploads/b.jpg" },
] as unknown as Photo[];

const BASE_PROPERTY = {
  id: 3,
  name: "Willa Pod Dębem",
  slug: "willa",
  description: "Opis obiektu",
  address: "Zakopane",
  photos: PHOTOS,
  unitTypes: [{ id: 7, name: "Dwuosobowy", description: "", maxGuests: 2, basePriceGr: 20000 }],
};

const config = () => buildDefaultConfig(BASE_PROPERTY as never, "nadmorski");

const renderEditor = (over?: { detachId?: string; photos?: Photo[]; cfg?: ReturnType<typeof config> }) =>
  render(
    <SectionEditor
      config={over?.cfg ?? config()}
      photos={over?.photos ?? PHOTOS}
      detachId={over?.detachId}
    />
  );

/** Panel sekcji danego typu (element <details> z jej etykietą w nagłówku). */
const panel = (type: keyof typeof SECTION_LABELS) => {
  const label = SECTION_LABELS[type];
  const summary = screen.getAllByText(label).find((el) => el.closest("summary"));
  return summary!.closest("details") as HTMLElement;
};

/**
 * Nazwy pól EDYCYJNych sekcji. Pomijamy pola ukryte (`sectionId`, `dir`) —
 * należą do formularzy sterujących (przesuwanie, widoczność), nie do treści.
 */
const fieldNames = (el: HTMLElement) =>
  Array.from(el.querySelectorAll<HTMLElement>("input[name],textarea[name],select[name]"))
    .filter((f) => f.getAttribute("type") !== "hidden")
    .map((f) => f.getAttribute("name")!);

afterEach(cleanup);

describe("lista sekcji", () => {
  it("pokazuje wszystkie sekcje z szablonu, po etykietach", () => {
    const cfg = config();
    renderEditor({ cfg });

    for (const section of cfg.sections) {
      expect(screen.getAllByText(SECTION_LABELS[section.type]).length, section.type).toBeGreaterThan(0);
    }
  });

  it("sekcja ukryta jest przekreślona, żeby było widać stan bez rozwijania", () => {
    const cfg = config();
    cfg.sections[1].enabled = false;

    renderEditor({ cfg });

    const label = within(panel(cfg.sections[1].type)).getAllByText(
      SECTION_LABELS[cfg.sections[1].type]
    )[0];
    expect(label.className).toContain("line-through");
  });

  it("każda sekcja niesie swój identyfikator w ukrytym polu każdego formularza", async () => {
    // formularze są niezależne (jeden na akcję) — brak id w którymkolwiek
    // oznaczałby akcję na cudzej sekcji albo błąd „nie znaleziono"
    const cfg = config();
    renderEditor({ cfg });

    const first = panel(cfg.sections[0].type);
    const ids = Array.from(first.querySelectorAll<HTMLInputElement>('input[name="sectionId"]'));
    expect(ids.length).toBeGreaterThan(2); // widoczność, przesuwanie, usuwanie, zapis
    expect(ids.every((i) => i.value === cfg.sections[0].id)).toBe(true);
  });
});

describe("pola per typ sekcji", () => {
  it("nagłówek ma teksty i wybór zdjęcia w tle", () => {
    renderEditor();

    const fields = fieldNames(panel("hero"));
    expect(fields).toEqual(expect.arrayContaining(["headline", "tagline", "ctaLabel", "photoId"]));
  });

  it("bez zdjęć obiektu nagłówek nie pokazuje nawet NAGŁÓWKA wyboru tła", () => {
    // Same pola i tak nie powstałyby dla pustej listy — wartownik chroni przed
    // pustą etykietą „Zdjęcie w tle" nad niczym, i to trzeba sprawdzać
    // (pierwsza wersja testu patrzyła na pola i przechodziła po zdjęciu
    // wartownika — wychwycone mutacją).
    renderEditor({ photos: [] });

    expect(within(panel("hero")).queryByText("Zdjęcie w tle")).toBeNull();
  });

  it("ze zdjęciami nagłówek pokazuje wybór tła", () => {
    renderEditor();

    expect(within(panel("hero")).getByText("Zdjęcie w tle")).toBeTruthy();
    expect(fieldNames(panel("hero"))).toContain("photoId");
  });

  it("sekcja opisowa ma tytuł i treść", () => {
    renderEditor();

    expect(fieldNames(panel("about"))).toEqual(expect.arrayContaining(["title", "html"]));
  });

  it("sekcja danych (apartamenty) ma TYLKO tytuł", () => {
    // treść bierze się z RezFlow — pole na nią byłoby obietnicą,
    // której edytor nie dowiezie
    renderEditor();

    expect(fieldNames(panel("units"))).toEqual(["title"]);
  });

  it("galeria, udogodnienia, kalendarz i opinie też mają tylko tytuł", () => {
    renderEditor();

    for (const type of ["gallery", "amenities", "calendar", "reviews"] as const) {
      expect(fieldNames(panel(type)), type).toEqual(["title"]);
    }
  });

  it("atrakcje mają tytuł i listę wpisów", () => {
    renderEditor();

    expect(fieldNames(panel("attractions"))).toEqual(expect.arrayContaining(["title", "items"]));
  });

  it("kontakt ma tytuł i wstęp", () => {
    renderEditor();

    expect(fieldNames(panel("contact"))).toEqual(expect.arrayContaining(["title", "intro"]));
  });

  it("limity długości pól są zadeklarowane w znacznikach", () => {
    // treść idzie na publiczną stronę; serwer przycina te same wartości
    renderEditor();

    const headline = panel("hero").querySelector('input[name="headline"]')!;
    expect(headline.getAttribute("maxLength")).toBe("120");
  });
});

describe("kolejność sekcji", () => {
  it("pierwsza sekcja nie da się przesunąć wyżej", () => {
    const cfg = config();
    renderEditor({ cfg });

    const up = within(panel(cfg.sections[0].type)).getByTitle("Przesuń wyżej");
    expect(up).toHaveProperty("disabled", true);
  });

  it("ostatnia sekcja nie da się przesunąć niżej", () => {
    const cfg = config();
    renderEditor({ cfg });

    const last = cfg.sections.at(-1)!;
    const down = within(panel(last.type)).getByTitle("Przesuń niżej");
    expect(down).toHaveProperty("disabled", true);
  });

  it("sekcja w środku ma obie strzałki aktywne", () => {
    const cfg = config();
    renderEditor({ cfg });

    const middle = panel(cfg.sections[1].type);
    expect(within(middle).getByTitle("Przesuń wyżej")).toHaveProperty("disabled", false);
    expect(within(middle).getByTitle("Przesuń niżej")).toHaveProperty("disabled", false);
  });

  it("przesuwanie niesie kierunek w formularzu", () => {
    const cfg = config();
    renderEditor({ cfg });

    const middle = panel(cfg.sections[1].type);
    const dirs = Array.from(middle.querySelectorAll<HTMLInputElement>('input[name="dir"]')).map(
      (i) => i.value
    );
    expect(dirs).toEqual(expect.arrayContaining(["up", "down"]));
  });
});

describe("widoczność sekcji", () => {
  it("włączona sekcja proponuje ukrycie, wyłączona — pokazanie", () => {
    const cfg = config();
    cfg.sections[0].enabled = true;
    cfg.sections[1].enabled = false;

    renderEditor({ cfg });

    expect(within(panel(cfg.sections[0].type)).getByTitle("Ukryj sekcję")).toBeTruthy();
    expect(within(panel(cfg.sections[1].type)).getByTitle("Pokaż sekcję")).toBeTruthy();
  });
});

describe("odpinanie sekcji od danych", () => {
  it("domyślnie widać tylko odnośnik, bez przycisku wykonującego operację", () => {
    // operacja jest nieodwracalna — nie może być jednym kliknięciem
    renderEditor();

    expect(screen.queryByText("Odepnij sekcję")).toBeNull();
    expect(screen.getAllByText(/Konwertuj na własny kod/).length).toBeGreaterThan(0);
  });

  it("wskazana sekcja pokazuje ostrzeżenie i przycisk potwierdzenia", () => {
    const cfg = config();
    const hero = cfg.sections.find((s) => s.type === "hero")!;

    renderEditor({ cfg, detachId: hero.id });

    expect(screen.getByText(/Tej operacji nie można cofnąć/)).toBeTruthy();
    expect(screen.getByText("Odepnij sekcję")).toBeTruthy();
    expect(screen.getByText("Anuluj")).toBeTruthy();
  });

  it("wskazana sekcja jest rozwinięta, żeby ostrzeżenie było widoczne", () => {
    const cfg = config();
    const hero = cfg.sections.find((s) => s.type === "hero")!;

    renderEditor({ cfg, detachId: hero.id });

    expect(panel("hero").getAttribute("open")).not.toBeNull();
  });

  it("sekcja będąca już własnym kodem nie proponuje odpięcia", () => {
    const cfg = normalizeConfig(config());
    cfg.sections = [newSection("customHtml")];

    renderEditor({ cfg });

    expect(screen.queryByText(/Konwertuj na własny kod/)).toBeNull();
  });
});

describe("dodawanie sekcji", () => {
  it("lista wyboru zawiera wszystkie typy sekcji", () => {
    renderEditor();

    const select = screen.getByLabelText("Typ nowej sekcji");
    const values = Array.from(select.querySelectorAll("option")).map((o) => o.getAttribute("value"));
    expect(values.sort()).toEqual(Object.keys(SECTION_LABELS).sort());
  });

  it("formularz dodawania ma własny przycisk", () => {
    renderEditor();

    expect(screen.getByText(/Dodaj sekcję/)).toBeTruthy();
  });
});
