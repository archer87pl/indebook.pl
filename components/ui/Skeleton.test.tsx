// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PRODUCT_NAME } from "@/lib/brand";
import Logo from "@/components/Logo";
import Skeleton from "./Skeleton";
import { KpiRowSkeleton, TableSkeleton, ToolbarSkeleton } from "@/components/admin/PanelSkeleton";

// Domknięcie warstwy prezentacji. Nie ma tu decyzji biznesowych, ale są dwie
// rzeczy, które da się zepsuć niezauważenie: szkielet ładowania musi być
// niewidoczny dla czytników ekranu (inaczej czyta pustą tabelę zamiast
// komunikatu „ładuję"), a logo w wariancie ciemnym musi odwracać kolory —
// zostawione jasne znika na ciemnym tle nawigacji.

afterEach(cleanup);

describe("Skeleton", () => {
  it("jest pomijany przez czytniki — to czysta dekoracja", () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);

    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute("aria-hidden")).not.toBeNull();
    expect(el.className).toContain("animate-pulse");
  });

  it("przyjmuje wymiary od wywołującego", () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);

    expect((container.firstElementChild as HTMLElement).className).toContain("h-4 w-20");
  });
});

describe("szkielety panelu", () => {
  const boxes = (el: HTMLElement) => el.querySelectorAll("[aria-hidden]").length;

  it("tabela ma nagłówek i tyle wierszy, ile zamówiono", () => {
    const { container } = render(<TableSkeleton rows={3} cols={["w-10", "w-20"]} />);

    // (3 wiersze + nagłówek) × 2 kolumny
    expect(boxes(container)).toBe(8);
  });

  it("liczba kolumn idzie z listy szerokości", () => {
    const { container } = render(<TableSkeleton rows={1} cols={["w-10"]} />);

    expect(boxes(container)).toBe(2);
  });

  it("rząd KPI ma tyle kart, ile zamówiono", () => {
    const { container } = render(<KpiRowSkeleton count={2} />);

    expect(container.firstElementChild!.childElementCount).toBe(2);
  });

  it("pasek narzędzi ma stały układ", () => {
    const { container } = render(<ToolbarSkeleton />);

    expect(boxes(container)).toBe(5);
  });
});

describe("Logo", () => {
  const svgText = (el: HTMLElement) => el.innerHTML;

  it("wariant ciemny odwraca kolory kafla i litery", () => {
    // logo w jasnym wariancie na ciemnym tle nawigacji byłoby niewidoczne
    const { container: light } = render(<Logo />);
    const jasny = svgText(light);

    cleanup();
    const { container: dark } = render(<Logo tone="dark" />);

    expect(svgText(dark)).not.toBe(jasny);
    expect(svgText(dark)).toContain("#4ade9b");
  });

  it("rozmiar skaluje kafel RAZEM z zaokrągleniem", () => {
    // sztywny promień daje przy 24 px prawie prostokąt, a przy 96 px prawie
    // kwadrat z lekko ściętymi rogami — porównanie całego innerHTML tego nie
    // wychwytuje, bo inne wartości i tak się różnią (wychwycone mutacją)
    const tile = (size: number) => {
      cleanup();
      const { container } = render(<Logo size={size} />);
      const el = container.querySelector<HTMLElement>("[style*='border-radius']")!;
      return { width: el.style.width, radius: el.style.borderRadius };
    };

    expect(tile(24)).toEqual({ width: "24px", radius: "7px" });
    expect(tile(96)).toEqual({ width: "96px", radius: "28px" });
  });

  it("nazwa produktu jest opcjonalna", () => {
    // sam kafel z inicjałem zostaje zawsze — chodzi o pełen wordmark obok
    const { container: bez } = render(<Logo wordmark={false} />);
    expect(bez.textContent).not.toContain(PRODUCT_NAME);

    cleanup();
    const { container: z } = render(<Logo wordmark />);
    expect(z.textContent).toContain(PRODUCT_NAME);
  });
});
