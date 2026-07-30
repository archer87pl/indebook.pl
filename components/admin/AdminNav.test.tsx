// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AdminNav, { type AdminNavItem } from "./AdminNav";

// Nawigacja panelu recepcji. Cała logika to jedno pytanie: która pozycja jest
// aktywna. Reguła nie jest oczywista — „/admin" musi pasować DOKŁADNIE (inaczej
// pulpit świeciłby się na każdym podstronie), a pozostałe pozycje obejmują też
// swoje podstrony (/admin/rezerwacje/55 podświetla „Rezerwacje").
// Wyróżnienie jest wyłącznie klasą CSS, więc test sprawdza klasę — to jedyny
// nośnik tej informacji w DOM.

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: false }),
}));

let pathname = "/admin";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const ITEMS: AdminNavItem[] = [
  { href: "/admin", label: "Pulpit", icon: "pulpit" },
  { href: "/admin/rezerwacje", label: "Rezerwacje", icon: "rezerwacje", badge: 3 },
  { href: "/admin/kalendarz", label: "Kalendarz", icon: "kalendarz" },
  { href: "/admin/cennik", label: "Cennik", icon: "cennik", badge: 0 },
];

const renderNav = (path: string) => {
  pathname = path;
  return render(<AdminNav items={ITEMS} />);
};

/** Aktywna pozycja ma tło mint (bg-brand-400) — to jedyny znacznik w DOM. */
const isHighlighted = (label: string) =>
  screen.getByText(label).closest("a")!.className.includes("bg-brand-400");

afterEach(cleanup);

describe("renderowanie pozycji", () => {
  it("pokazuje wszystkie pozycje z linkami", () => {
    renderNav("/admin");

    for (const item of ITEMS) {
      expect(screen.getByText(item.label).closest("a")!.getAttribute("href")).toBe(item.href);
    }
  });

  it("licznik pokazuje się tylko przy niezerowej wartości", () => {
    // „0” przy Cenniku wyglądałby jak zaległość, której nie ma
    renderNav("/admin");

    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("pozycja bez licznika nie renderuje pustej plakietki", () => {
    renderNav("/admin");

    const kalendarz = screen.getByText("Kalendarz").closest("a")!;
    expect(kalendarz.querySelectorAll("span")).toHaveLength(0);
  });
});

describe("aktywna pozycja", () => {
  it("na pulpicie świeci się tylko Pulpit", () => {
    renderNav("/admin");

    expect(isHighlighted("Pulpit")).toBe(true);
    expect(isHighlighted("Rezerwacje")).toBe(false);
  });

  it("„/admin” pasuje DOKŁADNIE, nie jako prefiks", () => {
    // to jest sedno: bez tego wyjątku pulpit byłby aktywny na każdej
    // podstronie panelu, bo każda zaczyna się od „/admin”
    renderNav("/admin/rezerwacje");

    expect(isHighlighted("Pulpit")).toBe(false);
    expect(isHighlighted("Rezerwacje")).toBe(true);
  });

  it("podstrona podświetla swoją sekcję", () => {
    renderNav("/admin/rezerwacje/55");

    expect(isHighlighted("Rezerwacje")).toBe(true);
    expect(isHighlighted("Pulpit")).toBe(false);
  });

  it("głębsza podstrona też podświetla sekcję", () => {
    renderNav("/admin/rezerwacje/55/karta");

    expect(isHighlighted("Rezerwacje")).toBe(true);
  });

  it("podobny prefiks NIE podświetla obcej sekcji", () => {
    // „/admin/rezerwacje-archiwum” nie jest podstroną „/admin/rezerwacje”,
    // więc dopasowanie musi iść po separatorze ścieżki, nie po samym tekście
    renderNav("/admin/rezerwacje-archiwum");

    expect(isHighlighted("Rezerwacje")).toBe(false);
  });

  it("nieznana ścieżka nie podświetla niczego", () => {
    renderNav("/admin/cos-nowego");

    for (const item of ITEMS) {
      expect(isHighlighted(item.label), item.label).toBe(false);
    }
  });

  it("dokładnie jedna pozycja jest aktywna naraz", () => {
    renderNav("/admin/kalendarz");

    const active = ITEMS.filter((i) => isHighlighted(i.label));
    expect(active.map((i) => i.label)).toEqual(["Kalendarz"]);
  });

  it("licznik przy aktywnej pozycji zmienia kontrast, żeby był czytelny", () => {
    // na tle mint jasna plakietka zniknęłaby
    renderNav("/admin/rezerwacje");

    const badge = screen.getByText("3");
    expect(badge.className).toContain("brand-950");
  });
});
