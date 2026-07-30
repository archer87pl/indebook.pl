// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { HealthGroup, HealthItem, HealthReport } from "@/lib/health";
import HealthPanel from "./HealthPanel";

// Panel gotowości obiektu na pulpicie. Wartość tego widoku leży w trzech
// rzeczach i każda może się cicho zepsuć: pozycja NIEZROBIONA musi być
// klikalnym odnośnikiem tam, gdzie się ją uzupełnia; blokady sprzedaży muszą
// się odróżniać od zaleceń; a pasek postępu ma nieść liczbę także dla czytnika
// ekranu, nie tylko szerokością diva.

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const item = (over: Partial<HealthItem> = {}): HealthItem => ({
  key: "terms",
  label: "Regulamin obiektu",
  hint: "Gość akceptuje go przy rezerwacji.",
  href: "/admin/obiekt",
  done: false,
  critical: true,
  ...over,
});

const report = (over: Partial<HealthReport> = {}): HealthReport => {
  const groups: HealthGroup[] = over.groups ?? [
    { key: "oferta", title: "Oferta", items: [item({ key: "photos", label: "Zdjęcia", done: true })] },
    { key: "formalnosci", title: "Formalności", items: [item()] },
  ];
  const items = groups.flatMap((g) => g.items);
  const missing = items.filter((i) => !i.done);
  return {
    groups,
    done: items.length - missing.length,
    total: items.length,
    percent: Math.round(((items.length - missing.length) / items.length) * 100),
    missing,
    criticalMissing: missing.filter((i) => i.critical).length,
    ...over,
  };
};

const bar = () => screen.getByRole("progressbar");

afterEach(cleanup);

describe("postęp", () => {
  it("procent jest w nagłówku i w pasku dla czytnika ekranu", () => {
    // sama szerokość diva jest niewidoczna dla czytnika — bez aria-valuenow
    // panel nie mówi nic osobie nawigującej bez wzroku
    render(<HealthPanel report={report({ percent: 40 })} />);

    expect(screen.getByText("40%")).toBeTruthy();
    expect(bar().getAttribute("aria-valuenow")).toBe("40");
  });

  it("szerokość paska odpowiada procentowi", () => {
    render(<HealthPanel report={report({ percent: 73 })} />);

    expect(bar().querySelector("div")!.getAttribute("style")).toContain("73%");
  });

  it("nagłówek podaje licznik pozycji, nie tylko procent", () => {
    // „60%" nie mówi, ile roboty zostało; „3 z 5" mówi
    render(<HealthPanel report={report({ done: 3, total: 5 })} />);

    expect(screen.getByText(/3 z 5 pozycji/)).toBeTruthy();
  });
});

describe("braki blokujące sprzedaż", () => {
  it("liczba blokad jest wypisana wprost", () => {
    render(
      <HealthPanel
        report={report({
          groups: [
            {
              key: "oferta",
              title: "Oferta",
              items: [item({ key: "a" }), item({ key: "b" }), item({ key: "c", critical: false })],
            },
          ],
        })}
      />,
    );

    expect(screen.getByText(/2 pozycje blokują przyjmowanie rezerwacji/)).toBeTruthy();
  });

  it("pojedyncza blokada ma poprawną odmianę", () => {
    render(<HealthPanel report={report()} />);

    expect(screen.getByText(/Jedna pozycja blokuje przyjmowanie rezerwacji/)).toBeTruthy();
  });

  it("same zalecenia nie straszą ostrzeżeniem o blokadzie", () => {
    // ostrzeżenie na wszystkim przestaje cokolwiek znaczyć
    render(
      <HealthPanel
        report={report({
          groups: [
            { key: "oferta", title: "Oferta", items: [item({ critical: false })] },
          ],
        })}
      />,
    );

    expect(screen.queryByText(/blokuj/i)).toBeNull();
  });

  it("pozycja krytyczna jest oznaczona w liście, nie tylko w podsumowaniu", () => {
    render(<HealthPanel report={report()} />);

    const link = screen.getByRole("link", { name: /Regulamin obiektu/ });
    expect(within(link).getByText("wymagane")).toBeTruthy();
  });

  it("zalecenie nie dostaje etykiety „wymagane”", () => {
    render(
      <HealthPanel
        report={report({
          groups: [
            { key: "oferta", title: "Oferta", items: [item({ critical: false })] },
          ],
        })}
      />,
    );

    expect(screen.queryByText("wymagane")).toBeNull();
  });
});

describe("lista pozycji", () => {
  it("niezrobiona pozycja prowadzi tam, gdzie się ją uzupełnia", () => {
    // bez tego panel mówi „czegoś brakuje" i zostawia szukanie właścicielowi
    render(<HealthPanel report={report()} />);

    expect(
      screen.getByRole("link", { name: /Regulamin obiektu/ }).getAttribute("href"),
    ).toBe("/admin/obiekt");
  });

  it("niezrobiona pozycja tłumaczy, po co to jest", () => {
    render(<HealthPanel report={report()} />);

    expect(screen.getByText("Gość akceptuje go przy rezerwacji.")).toBeTruthy();
  });

  it("zrobiona pozycja nie jest odnośnikiem ani nie powtarza podpowiedzi", () => {
    // gotowe rzeczy mają zniknąć z drogi, a nie zajmować uwagę
    render(<HealthPanel report={report()} />);

    expect(screen.queryByRole("link", { name: /Zdjęcia/ })).toBeNull();
    expect(screen.getByText("Zdjęcia")).toBeTruthy();
  });

  it("grupy mają nagłówki", () => {
    render(<HealthPanel report={report()} />);

    expect(screen.getByText("Oferta")).toBeTruthy();
    expect(screen.getByText("Formalności")).toBeTruthy();
  });

  it("lista jest rozwinięta, dopóki czegoś brakuje", () => {
    render(<HealthPanel report={report()} />);

    expect(document.querySelector("details")!.hasAttribute("open")).toBe(true);
  });

  it("przycisk rozwijania zapowiada PEŁNĄ liczbę pozycji, nie tylko zrobionych", () => {
    // „Pokaż listę (1)" przy dwóch pozycjach obiecywałoby krótszą listę,
    // niż właściciel zobaczy po kliknięciu
    render(<HealthPanel report={report()} />);

    expect(screen.getByText(/Pokaż listę \(2\)/)).toBeTruthy();
  });
});

describe("komplet", () => {
  const done = () =>
    report({
      groups: [
        {
          key: "oferta",
          title: "Oferta",
          items: [item({ key: "photos", label: "Zdjęcia", done: true })],
        },
      ],
    });

  it("po komplecie lista zwija się, żeby nie zajmować pulpitu", () => {
    render(<HealthPanel report={done()} />);

    expect(document.querySelector("details")!.hasAttribute("open")).toBe(false);
  });

  it("po komplecie panel to potwierdza słowami", () => {
    render(<HealthPanel report={done()} />);

    expect(screen.getByText(/gotowy do sprzedaży/)).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
  });

  it("potwierdzenie nie pojawia się przy niepełnym komplecie", () => {
    render(<HealthPanel report={report()} />);

    expect(screen.queryByText(/gotowy do sprzedaży/)).toBeNull();
  });

  it("zwinięta lista wciąż daje się rozwinąć", () => {
    render(<HealthPanel report={done()} />);

    expect(screen.getByText(/Pokaż listę/).closest("summary")).toBeTruthy();
  });
});
