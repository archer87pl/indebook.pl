// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Button from "./Button";
import SubmitButton from "./SubmitButton";

// Przyciski design systemu. Interesuje nas jedna rzecz ponad stylizacją:
// blokada podwójnego wysłania. Przycisk wysyłki formularza sam czyta stan
// akcji serwerowej (useFormStatus) i blokuje się na czas jej trwania — bez
// tego dwa kliknięcia przy wolnym łączu tworzą dwie rezerwacje.
// Krytyczne jest zawężenie do type="submit": blokowanie KAŻDEGO przycisku
// w formularzu unieruchomiłoby też „Anuluj" i przyciski poboczne.

let pending = false;
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormStatus: () => ({ pending }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const button = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
  pending = false;
});

afterEach(cleanup);

describe("Button — postać", () => {
  it("z href renderuje się jako link, nie przycisk", () => {
    render(
      <Button href="/admin/pokoje" variant="quiet">
        Pokoje
      </Button>
    );

    const link = screen.getByRole("link", { name: "Pokoje" });
    expect(link.getAttribute("href")).toBe("/admin/pokoje");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("bez href renderuje przycisk", () => {
    render(<Button>Zapisz</Button>);

    expect(button("Zapisz")).toBeTruthy();
  });

  it("wariant i rozmiar wchodzą do klas", () => {
    render(
      <Button variant="danger" size="lg">
        Usuń
      </Button>
    );

    const cls = button("Usuń").className;
    expect(cls).toContain("danger");
    expect(cls).toContain("h-11");
  });

  it("własna klasa dokłada się, a nie nadpisuje", () => {
    render(<Button className="w-full">Zapisz</Button>);

    const cls = button("Zapisz").className;
    expect(cls).toContain("w-full");
    expect(cls).toContain("inline-flex");
  });

  it("przekazuje atrybuty natywne, w tym stan wyłączenia", () => {
    render(
      <Button disabled type="button">
        Zapisz
      </Button>
    );

    expect(button("Zapisz")).toHaveProperty("disabled", true);
  });
});

describe("Button — blokada podwójnego wysłania", () => {
  it("w spoczynku przycisk wysyłki działa i nie ma spinnera", () => {
    render(<Button type="submit">Rezerwuję</Button>);

    expect(button("Rezerwuję")).toHaveProperty("disabled", false);
    expect(button("Rezerwuję").getAttribute("aria-busy")).toBeNull();
  });

  it("w trakcie akcji przycisk wysyłki jest zablokowany i oznaczony", () => {
    // dwa kliknięcia przy wolnym łączu to dwie rezerwacje
    pending = true;
    render(<Button type="submit">Rezerwuję</Button>);

    expect(button("Rezerwuję")).toHaveProperty("disabled", true);
    expect(button("Rezerwuję").getAttribute("aria-busy")).toBe("true");
  });

  it("blokada dotyczy WYŁĄCZNIE przycisków wysyłki", () => {
    // „Anuluj" obok formularza musi zostać klikalny, kiedy akcja trwa —
    // inaczej gość nie ma jak się wycofać
    pending = true;
    render(
      <>
        <Button type="submit">Rezerwuję</Button>
        <Button type="button">Anuluj</Button>
      </>
    );

    expect(button("Rezerwuję")).toHaveProperty("disabled", true);
    expect(button("Anuluj")).toHaveProperty("disabled", false);
  });

  it("przycisk bez podanego typu nie jest blokowany", () => {
    // domyślny type w HTML to submit, ale komponent sprawdza jawny atrybut —
    // test pilnuje faktycznego zachowania, żeby zmiana była świadoma
    pending = true;
    render(<Button>Zapisz</Button>);

    expect(button("Zapisz")).toHaveProperty("disabled", false);
  });

  it("link nie jest blokowany stanem formularza", () => {
    pending = true;
    render(<Button href="/admin">Wróć</Button>);

    expect(screen.getByRole("link", { name: "Wróć" })).toBeTruthy();
  });
});

describe("SubmitButton", () => {
  it("jest przyciskiem wysyłki bez podawania typu", () => {
    render(<SubmitButton>Wyślij</SubmitButton>);

    expect(button("Wyślij").getAttribute("type")).toBe("submit");
  });

  it("w trakcie akcji blokuje się i pokazuje spinner obok treści", () => {
    pending = true;
    render(<SubmitButton>Wyślij</SubmitButton>);

    expect(button("Wyślij")).toHaveProperty("disabled", true);
    expect(button("Wyślij").getAttribute("aria-busy")).toBe("true");
    expect(button("Wyślij").textContent).toContain("Wyślij");
  });

  it("tryb „replace” chowa treść — dla przycisków ikonowych o stałym rozmiarze", () => {
    // doklejenie spinnera do ikony rozwaliłoby układ przycisku
    pending = true;
    render(
      <SubmitButton pendingMode="replace" aria-label="Wyślij wiadomość">
        <span>ikona</span>
      </SubmitButton>
    );

    expect(screen.queryByText("ikona")).toBeNull();
    expect(button("Wyślij wiadomość")).toHaveProperty("disabled", true);
  });

  it("w spoczynku treść jest widoczna w obu trybach", () => {
    render(
      <SubmitButton pendingMode="replace">
        <span>ikona</span>
      </SubmitButton>
    );

    expect(screen.getByText("ikona")).toBeTruthy();
  });

  it("jawne wyłączenie działa niezależnie od stanu akcji", () => {
    // np. „Wystaw fakturę" bez NIP-u sprzedawcy
    render(<SubmitButton disabled>Wystaw fakturę</SubmitButton>);

    expect(button("Wystaw fakturę")).toHaveProperty("disabled", true);
  });
});
