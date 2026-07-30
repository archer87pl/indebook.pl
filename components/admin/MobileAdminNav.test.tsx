// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MobileAdminNav from "./MobileAdminNav";
import type { AdminNavItem } from "./AdminNav";

// Mobilna szuflada panelu. Trzy zachowania nie są oczywiste i żadnego nie
// widać w e2e na desktopie: zamknięcie po ZMIANIE TRASY (inaczej menu zostaje
// otwarte na nowej stronie), blokada przewijania strony pod otwartą szufladą
// oraz pułapka fokusu (Tab nie może uciec do treści pod spodem).

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

vi.mock("@/components/admin/NavProgress", () => ({
  NavPending: () => null,
  useReportNavPending: () => {},
}));

const ITEMS: AdminNavItem[] = [
  { href: "/admin", label: "Pulpit", icon: "pulpit" },
  { href: "/admin/rezerwacje", label: "Rezerwacje", icon: "rezerwacje" },
];

const logout = vi.fn(async () => {});

const renderNav = (path = "/admin") => {
  pathname = path;
  return render(
    <MobileAdminNav
      items={ITEMS}
      propertyName="Willa Pod Dębem"
      planLabel="Plan Standard"
      userEmail="recepcja@willa.pl"
      logout={logout}
    />
  );
};

// jsdom nie liczy układu, więc offsetParent jest wszędzie null — a pułapka
// fokusu odsiewa po nim elementy niewidoczne. Bez tej podmianki lista
// „fokusowalnych" byłaby pusta i testy fokusu nie sprawdzałyby niczego.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      return this.parentElement;
    },
  });
});

const drawer = () => screen.queryByRole("dialog");
const openMenu = () => userEvent.click(screen.getByLabelText("Otwórz menu"));

beforeEach(() => {
  pathname = "/admin";
  logout.mockClear();
  document.body.style.overflow = "";
});

afterEach(cleanup);

describe("pasek i otwieranie", () => {
  it("w spoczynku widać tylko pasek z hamburgerem", () => {
    renderNav();

    expect(screen.getByLabelText("Otwórz menu")).toBeTruthy();
    expect(drawer()).toBeNull();
  });

  it("hamburger mówi czytnikom, czy menu jest rozwinięte", async () => {
    renderNav();
    const burger = screen.getByLabelText("Otwórz menu");
    expect(burger.getAttribute("aria-expanded")).toBe("false");

    await openMenu();

    expect(screen.getByLabelText("Otwórz menu").getAttribute("aria-expanded")).toBe("true");
  });

  it("po otwarciu szuflada jest modalna i podpisana", async () => {
    renderNav();

    await openMenu();

    expect(drawer()!.getAttribute("aria-modal")).toBe("true");
    expect(drawer()!.getAttribute("aria-label")).toBe("Menu panelu");
  });

  it("szuflada niesie pełną nawigację, dane obiektu i konto", async () => {
    renderNav();

    await openMenu();

    expect(screen.getByText("Rezerwacje")).toBeTruthy();
    expect(screen.getByText("Willa Pod Dębem")).toBeTruthy();
    expect(screen.getByText("Plan Standard")).toBeTruthy();
    expect(screen.getByText("recepcja@willa.pl")).toBeTruthy();
    expect(screen.getByText("Ustawienia")).toBeTruthy();
  });
});

describe("zamykanie", () => {
  it("krzyżyk zamyka", async () => {
    renderNav();
    await openMenu();

    await userEvent.click(screen.getAllByLabelText("Zamknij menu")[1]);

    expect(drawer()).toBeNull();
  });

  it("tapnięcie tła zamyka", async () => {
    renderNav();
    await openMenu();

    await userEvent.click(screen.getAllByLabelText("Zamknij menu")[0]);

    expect(drawer()).toBeNull();
  });

  it("Escape zamyka — pułapka fokusu obsługuje klawiaturę", async () => {
    renderNav();
    await openMenu();

    await userEvent.keyboard("{Escape}");

    expect(drawer()).toBeNull();
  });

  it("zmiana trasy zamyka szufladę", async () => {
    // bez tego menu zostaje otwarte na nowej stronie i zasłania treść,
    // do której gość właśnie przeszedł
    const { rerender } = renderNav("/admin");
    await openMenu();
    expect(drawer()).toBeTruthy();

    pathname = "/admin/rezerwacje";
    rerender(
      <MobileAdminNav
        items={ITEMS}
        propertyName="Willa Pod Dębem"
        planLabel="Plan Standard"
        userEmail="recepcja@willa.pl"
        logout={logout}
      />
    );

    expect(drawer()).toBeNull();
  });

  it("ta sama trasa nie zamyka otwartej szuflady", async () => {
    // ponowny render z tą samą ścieżką (np. odświeżenie danych) nie może
    // zamykać menu pod ręką gościa
    const { rerender } = renderNav("/admin");
    await openMenu();

    rerender(
      <MobileAdminNav
        items={ITEMS}
        propertyName="Willa Pod Dębem"
        planLabel="Plan Standard"
        userEmail="recepcja@willa.pl"
        logout={logout}
      />
    );

    expect(drawer()).toBeTruthy();
  });
});

describe("blokada przewijania", () => {
  it("otwarta szuflada blokuje przewijanie strony pod spodem", async () => {
    renderNav();

    await openMenu();

    expect(document.body.style.overflow).toBe("hidden");
  });

  it("zamknięcie przywraca przewijanie", async () => {
    renderNav();
    await openMenu();

    await userEvent.keyboard("{Escape}");

    expect(document.body.style.overflow).toBe("");
  });

  it("odmontowanie przywraca przewijanie, nawet przy otwartej szufladzie", async () => {
    // nawigacja twarda albo błąd renderu nie może zostawić strony
    // zablokowanej na stałe
    const { unmount } = renderNav();
    await openMenu();

    unmount();

    expect(document.body.style.overflow).toBe("");
  });
});

describe("pułapka fokusu", () => {
  it("po otwarciu fokus wchodzi do szuflady", async () => {
    renderNav();

    await openMenu();

    expect(drawer()!.contains(document.activeElement)).toBe(true);
  });

  // Poniższe dwa testy celują w GRANICĘ pułapki, a nie w „tabowanie na oślep":
  // ustawiamy fokus na skrajnym elemencie i sprawdzamy jedno przejście. Wersja
  // z pętlą 12 tabów przechodziła nawet po zdjęciu zawijania (sprawdzone
  // mutacją), bo poza szufladą jest niemal nic do sfokusowania.
  // Pułapka obejmuje SAM drawer, nie całą warstwę — tło to osobny przycisk
  // będący rodzeństwem drawera, więc nie należy do listy zawijania.
  const focusables = () => {
    const panel = drawer()!.querySelector<HTMLElement>(":scope > div")!;
    return Array.from(panel.querySelectorAll<HTMLElement>("a[href],button:not([disabled])"));
  };

  it("Tab z ostatniego elementu wraca na pierwszy, nie wychodzi na stronę", async () => {
    // treść pod spodem jest zasłonięta — fokus na niej byłby pułapką
    // dla osoby nawigującej klawiaturą
    // cokolwiek fokusowalnego POZA szufladą — tu ucieknie fokus,
    // jeśli zawijanie przestanie działać
    render(<button type="button">poza szufladą</button>);
    renderNav();
    await openMenu();

    const items = focusables();
    items.at(-1)!.focus();
    await userEvent.tab();

    expect(document.activeElement).toBe(items[0]);
  });

  it("Shift+Tab z pierwszego elementu wraca na ostatni", async () => {
    // cokolwiek fokusowalnego POZA szufladą — tu ucieknie fokus,
    // jeśli zawijanie przestanie działać
    render(<button type="button">poza szufladą</button>);
    renderNav();
    await openMenu();

    const items = focusables();
    items[0].focus();
    await userEvent.tab({ shift: true });

    expect(document.activeElement).toBe(items.at(-1));
  });
});

describe("wylogowanie", () => {
  it("szuflada ma formularz wylogowania z akcją serwerową", async () => {
    // wylogowanie musi być POST-em (akcja serwerowa), nie linkiem —
    // link dałby się wywołać z obcej strony
    renderNav();
    await openMenu();

    const form = screen.getByTitle("Wyloguj").closest("form");
    expect(form).toBeTruthy();
  });
});
