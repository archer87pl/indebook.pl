// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SiteTemplate } from "@/lib/site-themes";
import SiteWizard, { type WizardDataSummary } from "./SiteWizard";

// Wizard pierwszego uruchomienia kreatora stron. Cztery kroki trzymane
// w stanie lokalnym, a na końcu JEDEN submit do akcji serwerowej — czyli
// wybory z kroków 1–3 muszą dojechać do formularza w ukrytych polach.
// To jest sedno: e2e klika się przez kreator, ale nie widzi, czy wysyłamy
// wybrany szablon, czy ten pierwszy z listy.

vi.mock("@/lib/site-actions", () => ({ createSite: vi.fn() }));

const TEMPLATES = [
  {
    key: "gorski",
    label: "Górski / rustykalny",
    blurb: "Ciepłe drewno i kamień.",
    defaultPalette: "drewno",
    defaultFont: "serif",
    palettes: [
      { key: "drewno", label: "Drewno", primary: "#8a5a2b", accent: "#c89f6a", bg: "#fffaf3" },
      { key: "kamien", label: "Kamień", primary: "#4a5568", accent: "#8fa3bf", bg: "#f7f9fc" },
    ],
  },
  {
    key: "nadmorski",
    label: "Nadmorski",
    blurb: "Piasek i turkus.",
    defaultPalette: "morze",
    defaultFont: "sans",
    palettes: [
      { key: "morze", label: "Morze", primary: "#1d6f8b", accent: "#5cc0d8", bg: "#f4fbfd" },
    ],
  },
] as unknown as SiteTemplate[];

const FONTS = [
  { key: "serif", label: "Szeryfowa" },
  { key: "sans", label: "Bezszeryfowa" },
];

const FULL_DATA: WizardDataSummary = {
  photoCount: 4,
  unitTypeCount: 2,
  hasDescription: true,
  hasAddress: true,
};

const renderWizard = (data: WizardDataSummary = FULL_DATA) =>
  render(
    <SiteWizard
      templates={TEMPLATES}
      fonts={FONTS}
      suggestedSubdomain="willa-pod-debem"
      baseDomain="rezflow.pl"
      data={data}
    />
  );

const next = () => userEvent.click(screen.getByRole("button", { name: /Dalej/ }));
const back = () => userEvent.click(screen.getByRole("button", { name: /Wstecz|Cofnij/ }));

/** Ukryte pola formularza końcowego — to one jadą do akcji serwerowej. */
const hiddenValue = (name: string) =>
  (document.querySelector(`input[name="${name}"]`) as HTMLInputElement | null)?.value;

async function goToLastStep() {
  await next();
  await next();
  await next();
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("przechodzenie kroków", () => {
  it("startuje od wyboru szablonu", () => {
    renderWizard();

    expect(screen.getByText("Wybierz szablon startowy")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Wstecz|Cofnij/ })).toBeNull();
  });

  it("Dalej prowadzi przez wszystkie kroki po kolei", async () => {
    renderWizard();

    await next();
    expect(screen.getByText("Stronę wypełnimy Twoimi danymi")).toBeTruthy();

    await next();
    expect(screen.getByText("Paleta kolorów")).toBeTruthy();

    await next();
    expect(screen.getByText("Adres Twojej strony")).toBeTruthy();
  });

  it("na ostatnim kroku nie ma już „Dalej”, tylko wysyłka", async () => {
    renderWizard();
    await goToLastStep();

    expect(screen.queryByRole("button", { name: /Dalej/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Utwórz stronę/ })).toBeTruthy();
  });

  it("cofanie wraca do poprzedniego kroku bez utraty wyborów", async () => {
    renderWizard();
    await userEvent.click(screen.getByRole("button", { name: /Nadmorski/ }));
    await next();

    await back();

    expect(screen.getByText("Wybierz szablon startowy")).toBeTruthy();
    await goToLastStep();
    expect(hiddenValue("template")).toBe("nadmorski");
  });
});

describe("wybór szablonu", () => {
  it("wybrany szablon jedzie w ukrytym polu", async () => {
    renderWizard();

    await userEvent.click(screen.getByRole("button", { name: /Nadmorski/ }));
    await goToLastStep();

    expect(hiddenValue("template")).toBe("nadmorski");
  });

  it("bez wyboru leci pierwszy szablon z listy", async () => {
    // kreator nie może wysłać pustego szablonu tylko dlatego, że gość
    // przeklikał krok bez zmiany
    renderWizard();
    await goToLastStep();

    expect(hiddenValue("template")).toBe("gorski");
  });

  it("zmiana szablonu podmienia paletę i font na jego domyślne", async () => {
    // paleta z innego szablonu nie istnieje w nowym — zostawiona
    // wyrenderowałaby stronę w kolorach, których nie ma w motywie
    renderWizard();
    await userEvent.click(screen.getByRole("button", { name: /Nadmorski/ }));
    await goToLastStep();

    expect(hiddenValue("palette")).toBe("morze");
    expect(hiddenValue("font")).toBe("sans");
  });

  it("krok wyglądu pokazuje palety TYLKO wybranego szablonu", async () => {
    renderWizard();
    await next();
    await next();

    expect(screen.getByRole("button", { name: /Drewno/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Kamień/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Morze/ })).toBeNull();
  });
});

describe("personalizacja", () => {
  it("wybrana paleta i font jadą w ukrytych polach", async () => {
    renderWizard();
    await next();
    await next();

    await userEvent.click(screen.getByRole("button", { name: /Kamień/ }));
    await userEvent.click(screen.getByRole("button", { name: "Bezszeryfowa" }));
    await next();

    expect(hiddenValue("palette")).toBe("kamien");
    expect(hiddenValue("font")).toBe("sans");
  });

  it("bez zmian jadą domyślne wartości szablonu", async () => {
    renderWizard();
    await goToLastStep();

    expect(hiddenValue("palette")).toBe("drewno");
    expect(hiddenValue("font")).toBe("serif");
  });
});

describe("adres strony", () => {
  it("podpowiada subdomenę z danych obiektu", async () => {
    renderWizard();
    await goToLastStep();

    expect(screen.getByLabelText("Subdomena")).toHaveProperty("value", "willa-pod-debem");
    expect(hiddenValue("subdomain")).toBe("willa-pod-debem");
  });

  it("pokazuje domenę bazową obok pola, żeby było widać cały adres", async () => {
    renderWizard();
    await goToLastStep();

    expect(screen.getByText(".rezflow.pl")).toBeTruthy();
  });

  it("zmieniona subdomena jedzie do akcji", async () => {
    renderWizard();
    await goToLastStep();

    const input = screen.getByLabelText("Subdomena");
    await userEvent.clear(input);
    await userEvent.type(input, "moja-willa");

    expect(hiddenValue("subdomain")).toBe("moja-willa");
  });
});

describe("podsumowanie danych obiektu", () => {
  it("kompletne dane pokazują same odhaczenia, bez ostrzeżeń", async () => {
    renderWizard();
    await next();

    expect(screen.getByText(/Pokoje \/ apartamenty \(2\)/)).toBeTruthy();
    expect(screen.getByText(/Zdjęcia obiektu \(4\)/)).toBeTruthy();
    expect(screen.getByText("Opis obiektu")).toBeTruthy();
    expect(screen.getByText("Adres obiektu")).toBeTruthy();
  });

  it("braki są pokazane z linkiem do miejsca, gdzie się je uzupełnia", async () => {
    // kreator nie blokuje startu przy brakach — ale musi powiedzieć, czego
    // zabraknie na stronie i gdzie to dopisać
    renderWizard({ photoCount: 0, unitTypeCount: 0, hasDescription: false, hasAddress: false });
    await next();

    expect(screen.getByText(/Pokoje \/ apartamenty \(0\)/)).toBeTruthy();
    const links = screen.getAllByRole("link");
    const targets = links.map((l) => l.getAttribute("href"));
    expect(targets).toContain("/admin/pokoje");
    expect(targets).toContain("/admin/obiekt");
  });

  it("braki nie blokują przejścia dalej", async () => {
    renderWizard({ photoCount: 0, unitTypeCount: 0, hasDescription: false, hasAddress: false });

    await goToLastStep();

    expect(screen.getByRole("button", { name: /Utwórz stronę/ })).toBeTruthy();
  });
});
