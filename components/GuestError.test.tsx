// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import GuestError from "./GuestError";
import HtmlLangSync from "./HtmlLangSync";
import Stepper, { type Step } from "./ui/Stepper";
import Tabs from "./ui/Tabs";
import Toggle from "./ui/Toggle";

// Drobne elementy interfejsu gościa i panelu. Najwięcej waży pierwszy:
// GuestError bierze kod błędu Z ADRESU, więc nieznana wartość musi degradować
// do komunikatu ogólnego — inaczej podmieniony parametr w linku renderuje się
// gościowi jako treść serwisu.

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => (key: string, values?: Record<string, unknown>) =>
    values ? `${namespace}.${key} ${JSON.stringify(values)}` : `${namespace}.${key}`,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: false }),
}));

afterEach(cleanup);

describe("GuestError", () => {
  it("bez kodu nie pokazuje pustego alertu", async () => {
    const { container } = render(await GuestError({}));

    expect(container.innerHTML).toBe("");
  });

  it("znany kod dostaje swój komunikat", async () => {
    render(await GuestError({ code: "pastArrival" }));

    expect(screen.getByText(/common.errors.pastArrival/)).toBeTruthy();
  });

  it("nieznany kod degraduje do komunikatu ogólnego", async () => {
    // stary link albo ręcznie podmieniony parametr — nigdy nie renderujemy
    // zawartości z adresu jako treści serwisu
    render(await GuestError({ code: "<b>cokolwiek</b>" }));

    expect(screen.getByText("common.errors.generic")).toBeTruthy();
    expect(screen.queryByText(/cokolwiek/)).toBeNull();
  });

  it("liczba z adresu trafia do komunikatu", async () => {
    render(await GuestError({ code: "minStay", n: "3" }));

    expect(screen.getByText(/"n":3/)).toBeTruthy();
  });

  it("nieliczbowy parametr degraduje do zera, zamiast pokazywać NaN", async () => {
    render(await GuestError({ code: "minStay", n: "trzy" }));

    expect(screen.getByText(/"n":0/)).toBeTruthy();
  });

  it("brak parametru też daje zero", async () => {
    render(await GuestError({ code: "minStay" }));

    expect(screen.getByText(/"n":0/)).toBeTruthy();
  });
});

describe("HtmlLangSync", () => {
  it("ustawia język dokumentu", () => {
    // <html lang> renderuje wspólny layout, który przy zmianie języka
    // nie przerysowuje się sam
    document.documentElement.lang = "pl";

    render(<HtmlLangSync locale="en" />);

    expect(document.documentElement.lang).toBe("en");
  });

  it("zmiana języka aktualizuje atrybut", () => {
    document.documentElement.lang = "pl";
    const { rerender } = render(<HtmlLangSync locale="en" />);

    rerender(<HtmlLangSync locale="de" />);

    expect(document.documentElement.lang).toBe("de");
  });

  it("nie renderuje niczego widocznego", () => {
    const { container } = render(<HtmlLangSync locale="pl" />);

    expect(container.innerHTML).toBe("");
  });
});

describe("Stepper", () => {
  const STEPS: Step[] = [
    { label: "Rezerwacja", state: "done" },
    { label: "Płatność", state: "active" },
    { label: "Meldunek", state: "todo" },
  ];

  it("krok ukończony ma znacznik, nie numer", () => {
    // numer przy ukończonym kroku sugeruje, że jeszcze coś zostało
    render(<Stepper steps={STEPS} />);

    const items = screen.getAllByRole("listitem");
    expect(items[0].textContent).not.toContain("1");
    expect(items[0].querySelector("svg")).toBeTruthy();
  });

  it("kroki bieżący i przyszłe pokazują swój numer", () => {
    render(<Stepper steps={STEPS} />);

    const items = screen.getAllByRole("listitem");
    expect(items[1].textContent).toContain("2");
    expect(items[2].textContent).toContain("3");
  });

  it("pierwszy krok nie ma łącznika przed sobą", () => {
    // kreska przed pierwszym krokiem wisiałaby w powietrzu
    render(<Stepper steps={STEPS} />);

    const items = screen.getAllByRole("listitem");
    expect(items[0].querySelectorAll("span.mx-2")).toHaveLength(0);
    expect(items[1].querySelectorAll("span.mx-2")).toHaveLength(1);
  });

  it("łącznik przed krokiem przyszłym jest wygaszony", () => {
    render(<Stepper steps={STEPS} />);

    const items = screen.getAllByRole("listitem");
    expect(items[1].querySelector("span.mx-2")!.className).toContain("bg-brand-600");
    expect(items[2].querySelector("span.mx-2")!.className).toContain("bg-slate-200");
  });

  it("etykieta bieżącego kroku jest wyróżniona", () => {
    render(<Stepper steps={STEPS} />);

    expect(screen.getByText("Płatność").className).toContain("font-bold");
    expect(screen.getByText("Meldunek").className).toContain("text-slate-400");
  });
});

describe("Tabs", () => {
  const ITEMS = [
    { href: "/admin/rezerwacje", label: "Wszystkie", count: 12, active: true },
    { href: "/admin/rezerwacje?status=PENDING", label: "Oczekujące", count: 0 },
    { href: "/admin/rezerwacje?status=CANCELLED", label: "Anulowane" },
  ];

  it("każda zakładka prowadzi pod swój adres", () => {
    render(<Tabs items={ITEMS} />);

    expect(screen.getByRole("link", { name: /Oczekujące/ }).getAttribute("href")).toBe(
      "/admin/rezerwacje?status=PENDING",
    );
  });

  it("licznik zerowy jest pokazany jako PIGUŁKA, a nie gołe zero", () => {
    // „Oczekujące 0" to informacja; ale sprawdzanie samego tekstu tu nie
    // wystarcza: `{count && <span>}` przy zerze renderuje w Reakcie gołe „0"
    // obok etykiety — tekst się zgadza, wygląd nie (wychwycone mutacją)
    render(<Tabs items={ITEMS} />);

    const pill = screen.getByRole("link", { name: /Oczekujące/ }).querySelector("span");
    expect(pill).not.toBeNull();
    expect(pill!.textContent).toBe("0");
  });

  it("zakładka bez licznika nie dostaje pustej pigułki", () => {
    const { container } = render(<Tabs items={ITEMS} />);

    const anulowane = Array.from(container.querySelectorAll("a")).find((a) =>
      a.textContent?.includes("Anulowane"),
    )!;
    expect(anulowane.querySelectorAll("span")).toHaveLength(0);
  });

  it("aktywna zakładka jest wyróżniona obwódką", () => {
    render(<Tabs items={ITEMS} />);

    expect(screen.getByRole("link", { name: /Wszystkie/ }).className).toContain("border-brand-600");
    expect(screen.getByRole("link", { name: /Anulowane/ }).className).toContain(
      "border-transparent",
    );
  });
});

describe("Toggle", () => {
  const box = () => document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;

  it("stan początkowy idzie z serwera", () => {
    // przełącznik działa bez JS — brak zaznaczenia cofałby ustawienie
    // przy każdym zapisie formularza
    render(<Toggle name="autoConfirm" defaultChecked />);

    expect(box().checked).toBe(true);
    expect(box().name).toBe("autoConfirm");
  });

  it("zablokowany przełącznik jest zablokowany naprawdę, nie tylko wizualnie", () => {
    const { container } = render(<Toggle name="autoConfirm" disabled />);

    expect(box().disabled).toBe(true);
    expect((container.firstElementChild as HTMLElement).className).not.toContain("cursor-pointer");
  });

  it("bez podpisów nie ma pustego bloku tekstu", () => {
    const { container } = render(<Toggle name="autoConfirm" />);

    expect(container.querySelectorAll("span.min-w-0")).toHaveLength(0);
  });

  it("sama podpowiedź bez etykiety też się pokazuje", () => {
    render(<Toggle name="autoConfirm" hint="Dotyczy tylko rezerwacji online" />);

    expect(screen.getByText("Dotyczy tylko rezerwacji online")).toBeTruthy();
  });

  it("sama etykieta nie ciągnie za sobą pustego wiersza podpowiedzi", () => {
    // blok podpisów powstaje już dla samej etykiety, więc podpowiedź
    // renderowana bez wartości dokłada niewidoczny wiersz i rozpycha rząd
    const { container } = render(<Toggle name="autoConfirm" label="Automatyczne potwierdzanie" />);

    expect(container.querySelector("span.min-w-0")!.childElementCount).toBe(1);
  });

  it("etykieta klika przełącznik — całość jest jednym celem", () => {
    render(<Toggle name="autoConfirm" label="Automatyczne potwierdzanie" />);

    expect(screen.getByText("Automatyczne potwierdzanie").closest("label")).toBeTruthy();
  });
});
