// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminTopbar from "./AdminTopbar";
import SuperNav from "./SuperNav";
import PreviewPane from "./site/PreviewPane";

// Trzy elementy ramy panelu. Dwa z nich mapują ŚCIEŻKĘ na stan i obie mapy
// są wrażliwe na kolejność reguł:
//  • AdminTopbar dobiera tytuł po prefiksie — „/admin" pasuje do wszystkiego,
//    więc musi być sprawdzane jako ostatnie, a „/admin/rezerwacje/nowa" przed
//    „/admin/rezerwacje",
//  • SuperNav podświetla Pulpit także na karcie obiektu (to jego podstrona,
//    choć adres tego nie sugeruje).

let pathname = "/admin";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: false }),
}));

vi.mock("./NavProgress", () => ({ NavPending: () => null }));

beforeEach(() => {
  pathname = "/admin";
});

afterEach(cleanup);

describe("AdminTopbar — tytuł strony", () => {
  /** Tytuł to pierwszy blok paska — bierzemy go z drzewa, nie po tekście. */
  const titleOn = (path: string) => {
    cleanup();
    pathname = path;
    const { container } = render(<AdminTopbar today="czwartek, 30 lipca" />);
    return container.querySelector("header > div > div")!.textContent;
  };

  it("pulpit ma własny tytuł", () => {
    expect(titleOn("/admin")).toBe("Pulpit");
  });

  it("podstrona dostaje tytuł swojej sekcji, nie „Pulpit”", () => {
    // „/admin" jest prefiksem wszystkich tras panelu — sprawdzany za wcześnie
    // przykryłby każdy inny tytuł
    expect(titleOn("/admin/kanaly")).toBe("Kanały sprzedaży");
    expect(titleOn("/admin/faktury")).toBe("Faktury");
  });

  it("trasa zagnieżdżona wygrywa z nadrzędną", () => {
    // „nowa rezerwacja" to osobny ekran, nie lista rezerwacji
    expect(titleOn("/admin/rezerwacje/nowa")).toBe("Nowa rezerwacja");
    expect(titleOn("/admin/rezerwacje")).toBe("Rezerwacje");
  });

  it("szczegóły rezerwacji dziedziczą tytuł listy", () => {
    expect(titleOn("/admin/rezerwacje/128")).toBe("Rezerwacje");
  });

  it("nieznana trasa dostaje neutralny tytuł zamiast pustki", () => {
    expect(titleOn("/cokolwiek")).toBe("Panel");
  });
});

describe("AdminTopbar — reszta paska", () => {
  it("pokazuje dzisiejszą datę podaną przez serwer", () => {
    // data liczona na kliencie rozjeżdżałaby się ze strefą obiektu
    render(<AdminTopbar today="czwartek, 30 lipca" />);

    expect(screen.getByText("czwartek, 30 lipca")).toBeTruthy();
  });

  it("wyszukiwarka prowadzi do listy rezerwacji", () => {
    render(<AdminTopbar today="czwartek, 30 lipca" />);

    const form = screen.getByRole("search");
    expect(form.getAttribute("action")).toBe("/admin/rezerwacje");
    expect(form.querySelector("input")!.getAttribute("name")).toBe("q");
  });

  it("skrót do nowej rezerwacji jest zawsze pod ręką", () => {
    render(<AdminTopbar today="czwartek, 30 lipca" />);

    expect(screen.getByRole("link").getAttribute("href")).toBe("/admin/rezerwacje/nowa");
  });

  it("pasek znika przy druku", () => {
    // wydruk potwierdzenia albo raportu nie potrzebuje nawigacji
    const { container } = render(<AdminTopbar today="czwartek, 30 lipca" />);

    expect((container.firstElementChild as HTMLElement).className).toContain("print:hidden");
  });
});

describe("SuperNav", () => {
  const active = () => {
    const found = screen
      .getAllByRole("link")
      .filter((a) => a.className.includes("border-brand-600"));
    return found.map((a) => a.textContent);
  };

  const renderOn = (path: string) => {
    cleanup();
    pathname = path;
    render(<SuperNav />);
  };

  it("pulpit platformy jest podświetlony na swojej trasie", () => {
    renderOn("/superadmin");

    expect(active()).toEqual(["Pulpit"]);
  });

  it("karta obiektu podświetla Pulpit — to jego podstrona", () => {
    // adres nie zawiera „/superadmin" jako całego segmentu, więc bez tej
    // reguły żadna zakładka nie byłaby aktywna
    renderOn("/superadmin/obiekt/12");

    expect(active()).toEqual(["Pulpit"]);
  });

  it("inne zakładki podświetlają się po prefiksie", () => {
    renderOn("/superadmin/rezerwacje");
    expect(active()).toEqual(["Rezerwacje"]);

    renderOn("/superadmin/logi");
    expect(active()).toEqual(["Logi"]);
  });

  it("podstrona zakładki nie gasi jej podświetlenia", () => {
    renderOn("/superadmin/opinie/44");

    expect(active()).toEqual(["Opinie"]);
  });

  it("na podstronie innej zakładki Pulpit NIE jest aktywny", () => {
    // „/superadmin" jest prefiksem każdej trasy panelu platformy —
    // naiwne startsWith podświetlałoby dwie zakładki naraz
    renderOn("/superadmin/ustawienia");

    expect(active()).toEqual(["Ustawienia"]);
  });
});

describe("PreviewPane", () => {
  const frame = () => document.querySelector("iframe")!;

  it("pokazuje wersję roboczą strony w ramce", () => {
    render(<PreviewPane />);

    expect(frame().getAttribute("src")).toBe("/podglad-strony");
  });

  it("startuje w widoku komputera", () => {
    render(<PreviewPane />);

    expect(frame().className).toContain("w-full");
  });

  it("przełącznik telefonu zwęża ramkę do szerokości telefonu", () => {
    render(<PreviewPane />);

    return userEvent.click(screen.getByTitle("Widok telefonu")).then(() => {
      expect(frame().className).toContain("w-[375px]");
    });
  });

  it("powrót do widoku komputera przywraca pełną szerokość", async () => {
    render(<PreviewPane />);
    await userEvent.click(screen.getByTitle("Widok telefonu"));

    await userEvent.click(screen.getByTitle("Widok komputera"));

    expect(frame().className).toContain("w-full");
  });

  it("aktywny widok jest wyróżniony", async () => {
    render(<PreviewPane />);
    expect(screen.getByTitle("Widok komputera").className).toContain("bg-brand-100");

    await userEvent.click(screen.getByTitle("Widok telefonu"));

    expect(screen.getByTitle("Widok telefonu").className).toContain("bg-brand-100");
    expect(screen.getByTitle("Widok komputera").className).not.toContain("bg-brand-100");
  });

  it("odświeżenie przemontowuje ramkę, a nie tylko zmienia adres", async () => {
    // ten sam src nie przeładowałby iframe'a; wymuszamy nowy element kluczem
    render(<PreviewPane />);
    const before = frame();

    await userEvent.click(screen.getByTitle("Odśwież podgląd"));

    expect(frame()).not.toBe(before);
  });

  it("zmiana widoku NIE przemontowuje ramki", async () => {
    // przemontowanie przy każdym przełączeniu gubiłoby przewinięcie podglądu
    render(<PreviewPane />);
    const before = frame();

    await userEvent.click(screen.getByTitle("Widok telefonu"));

    expect(frame()).toBe(before);
  });
});
