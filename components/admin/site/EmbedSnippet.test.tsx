// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EmbedSnippet from "./EmbedSnippet";

// Generator kodu widgetu. Właściciel wkleja to na swoją stronę i już nigdy
// tam nie zagląda — więc literówka w adresie albo brakujący atrybut ramki
// objawią się jako „widget nie działa" bez żadnej wskazówki, dlaczego.

const UNIT_TYPES = [
  { id: 7, name: "Pokój Standard" },
  { id: 8, name: "Apartament" },
];

const zapisane: string[] = [];

beforeEach(() => {
  zapisane.length = 0;
  Object.assign(navigator, {
    clipboard: { writeText: async (t: string) => void zapisane.push(t) },
  });
});

afterEach(cleanup);

const kod = () => screen.getByLabelText<HTMLTextAreaElement>("Kod do wklejenia").value;

describe("wygenerowany kod", () => {
  it("to ramka pod adresem widgetu wybranego pokoju", () => {
    render(<EmbedSnippet unitTypes={UNIT_TYPES} baseUrl="https://rezflow.pl" published />);

    expect(kod()).toContain('src="https://rezflow.pl/embed/kalendarz/7"');
    expect(kod()).toContain("<iframe");
  });

  it("zmiana pokoju zmienia adres w kodzie", async () => {
    // jeden widget pokazuje jeden typ pokoju — pomyłka tutaj wystawia
    // na stronie dostępność innego pokoju niż ten opisany obok
    render(<EmbedSnippet unitTypes={UNIT_TYPES} baseUrl="https://rezflow.pl" published />);

    await userEvent.selectOptions(screen.getByLabelText("Pokój"), "8");

    expect(kod()).toContain("/embed/kalendarz/8");
  });

  it("ramka jest responsywna i bez obwódki", () => {
    // szerokość na sztywno rozjeżdża układ na telefonie, a domyślna
    // obwódka iframe'a wygląda jak błąd renderowania
    render(<EmbedSnippet unitTypes={UNIT_TYPES} baseUrl="https://rezflow.pl" published />);

    expect(kod()).toContain('width="100%"');
    expect(kod()).toContain("border:0");
  });

  it("ma tytuł dla czytników ekranu i leniwe ładowanie", () => {
    render(<EmbedSnippet unitTypes={UNIT_TYPES} baseUrl="https://rezflow.pl" published />);

    expect(kod()).toContain('title="');
    expect(kod()).toContain('loading="lazy"');
  });

  it("adres bierze się z konfiguracji, nie jest wpisany na sztywno", () => {
    render(<EmbedSnippet unitTypes={UNIT_TYPES} baseUrl="https://moj-rezflow.example" published />);

    expect(kod()).toContain("https://moj-rezflow.example/embed/");
  });
});

describe("kopiowanie", () => {
  it("przycisk wrzuca do schowka dokładnie ten kod, który widać", async () => {
    render(<EmbedSnippet unitTypes={UNIT_TYPES} baseUrl="https://rezflow.pl" published />);

    await userEvent.click(screen.getByRole("button", { name: /Kopiuj/ }));

    expect(zapisane).toEqual([kod()]);
  });

  it("po skopiowaniu potwierdza to właścicielowi", async () => {
    // bez potwierdzenia nie wiadomo, czy kliknięcie zadziałało
    render(<EmbedSnippet unitTypes={UNIT_TYPES} baseUrl="https://rezflow.pl" published />);

    await userEvent.click(screen.getByRole("button", { name: /Kopiuj/ }));

    expect(screen.getByRole("button", { name: /Skopiowano/ })).toBeTruthy();
  });
});

describe("stany brzegowe", () => {
  it("bez opublikowanej strony ostrzega, że widget jeszcze nie zadziała", () => {
    // widget czyta te same dane co publiczne API — a ono odmawia obiektom
    // bez opublikowanej strony; bez ostrzeżenia właściciel wkleiłby kod
    // i zobaczył pustkę, nie wiedząc dlaczego
    render(<EmbedSnippet unitTypes={UNIT_TYPES} baseUrl="https://rezflow.pl" published={false} />);

    expect(screen.getByText(/po opublikowaniu strony/)).toBeTruthy();
  });

  it("opublikowana strona nie straszy ostrzeżeniem", () => {
    render(<EmbedSnippet unitTypes={UNIT_TYPES} baseUrl="https://rezflow.pl" published />);

    expect(screen.queryByText(/po opublikowaniu strony/)).toBeNull();
  });

  it("bez pokoi nie pokazuje kodu, tylko co zrobić najpierw", () => {
    // kod z pustym identyfikatorem prowadziłby do 404
    render(<EmbedSnippet unitTypes={[]} baseUrl="https://rezflow.pl" published />);

    expect(screen.getByText(/Najpierw dodaj typ pokoju/)).toBeTruthy();
    expect(screen.queryByLabelText("Kod do wklejenia")).toBeNull();
  });
});
