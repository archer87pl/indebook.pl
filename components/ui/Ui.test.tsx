// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import EmptyState from "./EmptyState";
import KpiCard from "./KpiCard";
import ProgressBar from "./ProgressBar";
import Segmented from "./Segmented";

// Prymitywy interfejsu panelu. Same w sobie są proste, ale dwa niosą logikę,
// której pomyłka jest widoczna dopiero na danych z produkcji:
//  • ProgressBar przycina wartość do 0–100 — bez tego pasek obłożenia przy
//    nadkomplecie wychodzi poza kartę,
//  • Segmented działa BEZ JavaScriptu (radio + peer), więc zaznaczenie
//    bieżącej wartości musi iść z serwera; jego brak cofa wybór właściciela.

afterEach(cleanup);

describe("ProgressBar", () => {
  const fill = (value: number, tone?: "primary" | "mint" | "warning") => {
    cleanup();
    const { container } = render(<ProgressBar value={value} tone={tone} />);
    // container to opakowanie RTL; tor paska jest jego dzieckiem, wypełnienie — wnukiem
    return container.firstElementChild!.firstElementChild as HTMLElement;
  };

  it("szerokość odpowiada wartości", () => {
    expect(fill(42).style.width).toBe("42%");
  });

  it("wartość powyżej stu jest przycięta — pasek nie wychodzi poza kartę", () => {
    // obłożenie potrafi przekroczyć 100% przy nadrezerwacji z kanału
    expect(fill(137).style.width).toBe("100%");
  });

  it("wartość ujemna jest przycięta do zera", () => {
    expect(fill(-8).style.width).toBe("0%");
  });

  it("skrajne wartości zostają nietknięte", () => {
    expect(fill(0).style.width).toBe("0%");
    expect(fill(100).style.width).toBe("100%");
  });

  it("każdy wariant ma swój kolor wypełnienia", () => {
    // ostrzegawczy pasek nie może wyglądać jak zwykły
    expect(fill(50).className).toContain("bg-brand-600");
    expect(fill(50, "mint").className).toContain("bg-brand-400");
    expect(fill(50, "warning").className).toContain("bg-accent-400");
  });
});

describe("Segmented", () => {
  const OPTIONS = [
    { value: "ONLINE", label: "Bezpośrednia" },
    { value: "MANUAL", label: "Ręczna", hint: "telefon, e-mail" },
  ];

  const radios = () =>
    Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]'));

  it("bieżąca wartość jest zaznaczona", () => {
    // formularz działa bez JS — brak zaznaczenia cofałby wybór właściciela
    // przy każdym zapisie formularza
    render(<Segmented name="channel" options={OPTIONS} defaultValue="MANUAL" />);

    expect(radios().map((r) => r.checked)).toEqual([false, true]);
  });

  it("bez wskazanej wartości nic nie jest zaznaczone", () => {
    render(<Segmented name="channel" options={OPTIONS} />);

    expect(radios().some((r) => r.checked)).toBe(false);
  });

  it("wszystkie opcje należą do jednej grupy", () => {
    // różne nazwy dałyby możliwość zaznaczenia dwóch naraz
    render(<Segmented name="channel" options={OPTIONS} defaultValue="ONLINE" />);

    expect(radios().every((r) => r.name === "channel")).toBe(true);
    expect(radios().map((r) => r.value)).toEqual(["ONLINE", "MANUAL"]);
  });

  it("podpowiedź pokazuje się tylko przy opcjach, które ją mają", () => {
    // liczymy elementy, nie tekst: podpowiedź renderowana bez wartości zostawia
    // pusty wiersz, który podnosi segment i rozjeżdża siatkę (wychwycone mutacją)
    const { container } = render(<Segmented name="channel" options={OPTIONS} />);

    expect(screen.getByText("telefon, e-mail")).toBeTruthy();
    const [bezPodpowiedzi, zPodpowiedzia] = Array.from(
      container.querySelectorAll("label > span"),
    );
    expect(bezPodpowiedzi.childElementCount).toBe(1);
    expect(zPodpowiedzia.childElementCount).toBe(2);
  });

  it("domyślnie kolumn jest tyle, co opcji", () => {
    const { container } = render(<Segmented name="channel" options={OPTIONS} />);

    expect((container.firstElementChild as HTMLElement).style.gridTemplateColumns).toBe(
      "repeat(2, minmax(0,1fr))",
    );
  });

  it("liczbę kolumn da się narzucić — dla dłuższych list", () => {
    const { container } = render(<Segmented name="channel" options={OPTIONS} columns={1} />);

    expect((container.firstElementChild as HTMLElement).style.gridTemplateColumns).toBe(
      "repeat(1, minmax(0,1fr))",
    );
  });
});

describe("KpiCard", () => {
  it("pokazuje etykietę i wartość", () => {
    render(<KpiCard label="Przychód" value="3 830 zł" />);

    expect(screen.getByText("Przychód")).toBeTruthy();
    expect(screen.getByText("3 830 zł")).toBeTruthy();
  });

  it("pigułka trendu jest tylko w wariancie ciemnym", () => {
    // wariant jasny nie ma dla niej miejsca w układzie 1c
    render(<KpiCard label="Przychód" value="3 830 zł" trend="▲ 18%" dark />);
    expect(screen.getByText("▲ 18%")).toBeTruthy();

    cleanup();
    render(<KpiCard label="Przychód" value="3 830 zł" trend="▲ 18%" />);
    expect(screen.queryByText("▲ 18%")).toBeNull();
  });

  it("pasek postępu wypiera podpis, gdy oba są podane", () => {
    // dwa wskaźniki naraz rozpychałyby kartę; pasek niesie więcej
    const { container } = render(
      <KpiCard label="Obłożenie" value="62%" sub="RevPAR 0 zł" progress={62} />,
    );

    expect(container.firstElementChild!.querySelector("div > div")).toBeTruthy();
    expect(screen.queryByText("RevPAR 0 zł")).toBeNull();
  });

  it("bez paska pokazuje podpis", () => {
    render(<KpiCard label="Obłożenie" value="62%" sub="RevPAR 0 zł" />);

    expect(screen.getByText("RevPAR 0 zł")).toBeTruthy();
  });

  it("pasek o wartości zero to nadal pasek, nie brak paska", () => {
    // `progress={0}` musi przejść przez sprawdzenie „czy podano" —
    // zwykłe sprawdzenie prawdziwości pokazałoby zamiast niego podpis
    render(<KpiCard label="Obłożenie" value="0%" sub="RevPAR 0 zł" progress={0} />);

    expect(screen.queryByText("RevPAR 0 zł")).toBeNull();
  });

  it("wariant ciemny i jasny różnią się tłem", () => {
    const { container: dark } = render(<KpiCard label="A" value="1" dark />);
    expect((dark.firstElementChild as HTMLElement).className).toContain("bg-brand-900");

    cleanup();
    const { container: light } = render(<KpiCard label="A" value="1" />);
    expect((light.firstElementChild as HTMLElement).className).toContain("bg-white");
  });
});

describe("EmptyState", () => {
  it("tytuł jest nagłówkiem, żeby czytnik go zapowiedział", () => {
    render(<EmptyState title="Brak rezerwacji" />);

    expect(screen.getByRole("heading", { name: "Brak rezerwacji" })).toBeTruthy();
  });

  it("opis, ikona i akcja są opcjonalne", () => {
    const { container } = render(<EmptyState title="Brak rezerwacji" />);

    expect(container.querySelectorAll("p")).toHaveLength(0);
    expect(container.firstElementChild!.querySelectorAll("div")).toHaveLength(0);
  });

  it("z akcją pokazuje ją pod opisem", () => {
    render(
      <EmptyState
        title="Brak pokoi"
        description="Dodaj pierwszy typ pokoju."
        action={<button type="button">Dodaj</button>}
      />,
    );

    expect(screen.getByText("Dodaj pierwszy typ pokoju.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dodaj" })).toBeTruthy();
  });
});
