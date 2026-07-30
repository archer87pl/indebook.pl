// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addDaysISO, todayISO } from "@/lib/dates";
import SearchForm from "./SearchForm";
import StarRating from "./StarRating";
import StatusBadge, { STATUS_LABELS } from "./StatusBadge";

// Trzy elementy pierwszego kontaktu gościa z ofertą.
//  • SearchForm ustawia daty startowe i DOLNE OGRANICZENIA pól — bez nich
//    przeglądarka wpuszcza wczorajszy przyjazd i wyjazd przed przyjazdem,
//    a odrzuca to dopiero serwer, po przeładowaniu.
//  • StarRating trzyma ocenę w ukrytym polu; pusta ocena musi zostać PUSTA,
//    inaczej formularz opinii wyśle zero jako gwiazdki.
//  • StatusBadge tłumaczy status z bazy na język gościa.

// Podstawiamy klucz zamiast tłumaczenia: test ma pilnować, o KTÓRY tekst
// komponent prosi, a nie powielać polską korektę.
vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    return Object.assign(t, { rich: t, markup: t, raw: t, has: () => true });
  },
}));

const today = todayISO();

afterEach(cleanup);

describe("SearchForm — daty startowe", () => {
  it("proponuje jutro–pojutrze+1, żeby gość nie zaczynał od pustych pól", () => {
    render(<SearchForm action="/szukaj" />);

    expect(screen.getByLabelText<HTMLInputElement>("checkIn").value).toBe(addDaysISO(today, 1));
    expect(screen.getByLabelText<HTMLInputElement>("checkOut").value).toBe(addDaysISO(today, 3));
  });

  it("wybrany wcześniej termin zostaje po powrocie do wyników", () => {
    // gość zmienia liczbę osób i wraca — daty nie mogą się resetować
    render(<SearchForm action="/szukaj" from="2026-09-10" to="2026-09-14" guests={4} />);

    expect(screen.getByLabelText<HTMLInputElement>("checkIn").value).toBe("2026-09-10");
    expect(screen.getByLabelText<HTMLInputElement>("checkOut").value).toBe("2026-09-14");
    expect(screen.getByLabelText<HTMLInputElement>("guestsLabel").value).toBe("4");
  });

  it("domyślnie szuka dla dwóch osób", () => {
    render(<SearchForm action="/szukaj" />);

    expect(screen.getByLabelText<HTMLInputElement>("guestsLabel").value).toBe("2");
  });
});

// Widget i pasek to dwa osobne drzewa JSX z powielonymi atrybutami — pomyłka
// w jednym z nich nie rusza drugiego, więc każde ograniczenie sprawdzamy
// w OBU wariantach (pierwsza wersja testów patrzyła tylko na pasek
// i przepuszczała mutacje w widgecie).
describe.each(["inline", "widget"] as const)("SearchForm — ograniczenia (%s)", (variant) => {
  it("przyjazd nie może być w przeszłości", () => {
    render(<SearchForm action="/szukaj" variant={variant} />);

    expect(screen.getByLabelText("checkIn").getAttribute("min")).toBe(today);
  });

  it("wyjazd najwcześniej jutro — pobyt zerowy nie istnieje", () => {
    render(<SearchForm action="/szukaj" variant={variant} />);

    expect(screen.getByLabelText("checkOut").getAttribute("min")).toBe(addDaysISO(today, 1));
  });

  it("obie daty są wymagane", () => {
    render(<SearchForm action="/szukaj" variant={variant} />);

    expect(screen.getByLabelText("checkIn").hasAttribute("required")).toBe(true);
    expect(screen.getByLabelText("checkOut").hasAttribute("required")).toBe(true);
  });

  it("liczba gości mieści się w 1–12 i domyślnie wynosi 2", () => {
    // zero osób to nie rezerwacja, a setka to pomyłka w polu
    render(<SearchForm action="/szukaj" variant={variant} />);

    const guests = screen.getByLabelText<HTMLInputElement>("guestsLabel");
    expect(guests.getAttribute("min")).toBe("1");
    expect(guests.getAttribute("max")).toBe("12");
    expect(guests.value).toBe("2");
  });

  it("daty startowe są takie same w obu wariantach", () => {
    render(<SearchForm action="/szukaj" variant={variant} />);

    expect(screen.getByLabelText<HTMLInputElement>("checkIn").value).toBe(addDaysISO(today, 1));
    expect(screen.getByLabelText<HTMLInputElement>("checkOut").value).toBe(addDaysISO(today, 3));
  });

  it("formularz trafia tam, gdzie każe wywołujący", () => {
    render(<SearchForm action="/o/willa/wyniki" variant={variant} />);

    expect(document.querySelector("form")!.getAttribute("action")).toBe("/o/willa/wyniki");
  });
});

describe("SearchForm — warianty", () => {
  it("wariant widgetu ma własne wezwanie do działania", () => {
    render(<SearchForm action="/szukaj" variant="widget" />);

    expect(screen.getByRole("button", { name: "checkAvailability" })).toBeTruthy();
  });

  it("wariant paska ma wezwanie „szukaj terminu”", () => {
    render(<SearchForm action="/szukaj" variant="inline" />);

    expect(screen.getByRole("button", { name: "searchDates" })).toBeTruthy();
  });

  it("oba warianty zbierają te same pola", () => {
    // widget i pasek trafiają do tej samej trasy — inne nazwy pól
    // dawałyby wyniki dla domyślnych dat zamiast wybranych
    const names = () =>
      Array.from(document.querySelectorAll<HTMLInputElement>("form input[name]")).map(
        (i) => i.name,
      );

    render(<SearchForm action="/szukaj" variant="inline" />);
    const inline = names();
    cleanup();
    render(<SearchForm action="/szukaj" variant="widget" />);

    expect(names()).toEqual(inline);
    expect(inline).toEqual(["from", "to", "guests"]);
  });
});

describe("StarRating", () => {
  const stars = () => screen.getAllByRole("button");
  const hidden = () => document.querySelector<HTMLInputElement>('input[name="rating"]')!;

  it("bez wyboru pole oceny jest PUSTE, nie zerowe", () => {
    // zero przeszłoby przez „pole wypełnione" i poszło na serwer jako ocena
    render(<StarRating />);

    expect(hidden().value).toBe("");
  });

  it("kliknięcie ustawia ocenę", async () => {
    render(<StarRating />);

    await userEvent.click(stars()[3]);

    expect(hidden().value).toBe("4");
  });

  it("gwiazdki do wybranej są podświetlone, dalsze wygaszone", () => {
    render(<StarRating />);

    return userEvent.click(stars()[2]).then(() => {
      const colored = stars().map((b) => b.className.includes("text-accent-500"));
      expect(colored).toEqual([true, true, true, false, false]);
    });
  });

  it("najechanie pokazuje podgląd oceny bez jej ustawiania", async () => {
    // podgląd ma być czytelny, ale opuszczenie myszy nie może zapisać oceny
    render(<StarRating />);

    await userEvent.hover(stars()[4]);
    expect(stars()[4].className).toContain("text-accent-500");

    await userEvent.unhover(stars()[4]);
    expect(hidden().value).toBe("");
  });

  it("po opuszczeniu gwiazdek wraca wybrana ocena, nie podgląd", async () => {
    render(<StarRating />);
    await userEvent.click(stars()[1]);

    await userEvent.hover(stars()[4]);
    await userEvent.unhover(stars()[4]);

    const colored = stars().map((b) => b.className.includes("text-accent-500"));
    expect(colored).toEqual([true, true, false, false, false]);
  });

  it("zmiana zdania nadpisuje ocenę", async () => {
    render(<StarRating />);

    await userEvent.click(stars()[4]);
    await userEvent.click(stars()[0]);

    expect(hidden().value).toBe("1");
  });

  it("opis słowny pojawia się dopiero po wyborze", async () => {
    // sprawdzamy OBECNOŚĆ elementu, nie jego treść: pusta etykieta dla oceny 0
    // dawałaby pusty `<span>`, którego wyszukiwanie po tekście nie widzi
    // (wychwycone mutacją)
    const { container } = render(<StarRating />);
    const row = container.firstElementChild!;
    expect(row.childElementCount).toBe(2); // ukryte pole + gwiazdki

    await userEvent.click(stars()[2]);

    expect(row.childElementCount).toBe(3);
    expect(screen.getByText("stars.3")).toBeTruthy();
  });

  it("każda gwiazdka jest podpisana dla czytnika ekranu", () => {
    render(<StarRating />);

    expect(stars().every((b) => b.getAttribute("aria-label") === "starsAria")).toBe(true);
  });

  it("gwiazdki nie wysyłają formularza", () => {
    // domyślny type=submit wysłałby opinię przy kliknięciu w ocenę
    render(<StarRating />);

    expect(stars().every((b) => b.getAttribute("type") === "button")).toBe(true);
  });
});

describe("StatusBadge", () => {
  it("tłumaczy status z bazy na zdanie dla człowieka", () => {
    render(<StatusBadge status="PENDING" />);

    expect(screen.getByText(STATUS_LABELS.PENDING)).toBeTruthy();
    expect(STATUS_LABELS.PENDING).toBe("Oczekuje na wpłatę");
  });

  it("każdy status ma własny kolor", () => {
    // wspólny kolor dla potwierdzonej i anulowanej mylił w listach rezerwacji
    const tone = (status: string) => {
      cleanup();
      render(<StatusBadge status={status} />);
      return screen.getByText(STATUS_LABELS[status]).className;
    };

    expect(tone("PENDING")).toContain("accent");
    expect(tone("CONFIRMED")).toContain("brand");
    expect(tone("CANCELLED")).toContain("danger");
  });

  it("nieznany status pokazuje siebie, zamiast znikać", () => {
    // nowy status w bazie ma być widoczny, choćby surowo
    render(<StatusBadge status="EXPIRED" />);

    const badge = screen.getByText("EXPIRED");
    expect(badge.className).toContain("slate");
  });
});
