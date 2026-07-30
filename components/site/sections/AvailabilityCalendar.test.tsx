// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AvailabilityCalendar, { type CalendarLabels } from "./AvailabilityCalendar";

// Widget dostępności na stronach WWW obiektów — jedyny kawałek interfejsu
// gościa z realną logiką po stronie klienta: siatka miesiąca, wybór zakresu
// i budowa adresu rezerwacji. E2E sprawdza, że się hydratuje; tu sprawdzamy
// zachowanie, którego przez przeglądarkę nie da się rozsądnie wymusić:
// przeszłe daty, dni bez miejsc, kliknięcia w odwrotnej kolejności, błąd API.

const LABELS: CalendarLabels = {
  pickRoom: "Wybierz pokój",
  prevMonth: "Poprzedni miesiąc",
  nextMonth: "Następny miesiąc",
  hintStart: "Kliknij dzień przyjazdu",
  hintEnd: "Kliknij dzień wyjazdu",
  bookThese: "Rezerwuję ten termin",
  loadError: "Nie udało się wczytać dostępności",
  weekdays: ["pon", "wt", "śr", "czw", "pt", "sob", "ndz"],
  months: [
    "styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec",
    "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień",
  ],
};

const UNIT_TYPES = [
  { id: 7, name: "Dwuosobowy" },
  { id: 8, name: "Apartament" },
];

/** „Dziś" ustawiamy na 10 sierpnia 2026 — dni 1–9 są wtedy przeszłe. */
const TODAY = new Date("2026-08-10T09:00:00Z");

type Day = { date: string; free: number; priceGr: number };

const augustDays = (over: Partial<Record<string, Partial<Day>>> = {}): Day[] =>
  Array.from({ length: 31 }, (_, i) => {
    const date = `2026-08-${String(i + 1).padStart(2, "0")}`;
    return { date, free: 2, priceGr: 20000, ...(over[date] ?? {}) };
  });

const requests: string[] = [];
let respondWith: (url: string) => { ok: boolean; days?: Day[] } = () => ({
  ok: true,
  days: augustDays(),
});

function mountFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      requests.push(String(url));
      const { ok, days } = respondWith(String(url));
      return new Response(JSON.stringify({ days }), { status: ok ? 200 : 500 });
    })
  );
}

const renderCalendar = (unitTypes = UNIT_TYPES) =>
  render(
    <AvailabilityCalendar
      unitTypes={unitTypes}
      appUrl="https://rezflow.pl"
      bookPath="/rezerwuj"
      labels={LABELS}
    />
  );

/**
 * Przycisk dnia miesiąca. Czeka, aż siatka się wyrenderuje — sam fakt, że
 * fetch został wywołany, nie znaczy jeszcze, że stan doszedł do widoku.
 * Dopasowanie po pierwszym <span> (numer dnia), bo dostępna nazwa przycisku
 * zawiera sklejoną cenę („12200 zł") i regex po niej jest zwodniczy.
 */
async function dayButton(day: number): Promise<HTMLElement> {
  let found: HTMLElement | undefined;
  await waitFor(() => {
    found = screen
      .getAllByRole("button")
      .find((b) => b.querySelector("span")?.textContent === String(day));
    expect(found, `przycisk dnia ${day}`).toBeTruthy();
  });
  return found!;
}

async function clickDay(day: number) {
  await userEvent.click(await dayButton(day));
}

beforeEach(() => {
  requests.length = 0;
  respondWith = () => ({ ok: true, days: augustDays() });
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(TODAY);
  mountFetch();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("wczytywanie dostępności", () => {
  it("pyta API o pierwszy typ pokoju i bieżący miesiąc", async () => {
    renderCalendar();

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toBe("/api/sites/availability?unitTypeId=7&month=2026-08");
  });

  it("pokazuje ceny wolnych dni po wczytaniu", async () => {
    renderCalendar();

    expect(await screen.findByText("Kliknij dzień przyjazdu")).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText("200 zł").length).toBeGreaterThan(0));
  });

  it("błąd API pokazuje komunikat, a nie puste miejsce", async () => {
    respondWith = () => ({ ok: false });

    renderCalendar();

    expect(await screen.findByText(LABELS.loadError)).toBeTruthy();
  });

  it("zmiana typu pokoju odpytuje API ponownie", async () => {
    renderCalendar();
    await waitFor(() => expect(requests).toHaveLength(1));

    await userEvent.selectOptions(screen.getByLabelText("Wybierz pokój"), "8");

    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toContain("unitTypeId=8");
  });

  it("pojedynczy typ pokoju nie pokazuje wyboru", async () => {
    renderCalendar([UNIT_TYPES[0]]);

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(screen.queryByLabelText("Wybierz pokój")).toBeNull();
  });
});

describe("nawigacja po miesiącach", () => {
  it("następny miesiąc odpytuje API o kolejny okres", async () => {
    renderCalendar();
    await waitFor(() => expect(requests).toHaveLength(1));

    await userEvent.click(screen.getByLabelText("Następny miesiąc"));

    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toContain("month=2026-09");
  });

  it("nie da się cofnąć przed miesiąc bieżący", async () => {
    // wsteczne miesiące nie mają czego sprzedawać — przycisk jest zablokowany
    renderCalendar();
    await waitFor(() => expect(requests).toHaveLength(1));

    expect(screen.getByLabelText("Poprzedni miesiąc")).toHaveProperty("disabled", true);
  });

  it("po przejściu w przód można wrócić", async () => {
    renderCalendar();
    await userEvent.click(screen.getByLabelText("Następny miesiąc"));
    await waitFor(() => expect(requests).toHaveLength(2));

    await userEvent.click(screen.getByLabelText("Poprzedni miesiąc"));

    await waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[2]).toContain("month=2026-08");
  });

  it("przełom roku liczy się poprawnie", async () => {
    renderCalendar();
    for (let i = 0; i < 5; i++) {
      await userEvent.click(screen.getByLabelText("Następny miesiąc"));
    }

    await waitFor(() => expect(requests.at(-1)).toContain("month=2027-01"));
  });
});

describe("wybór terminu", () => {
  it("pierwsze kliknięcie ustawia przyjazd, drugie wyjazd", async () => {
    renderCalendar();
    await waitFor(() => expect(requests).toHaveLength(1));

    await clickDay(12);
    expect(screen.getByText("Kliknij dzień wyjazdu")).toBeTruthy();

    await clickDay(15);
    expect(screen.getByText("2026-08-12 → 2026-08-15")).toBeTruthy();
  });

  it("kliknięcie wcześniejszego dnia zaczyna wybór od nowa", async () => {
    // gość, który pomylił kolejność, nie może dostać zakresu „od 15 do 12"
    renderCalendar();
    await waitFor(() => expect(requests).toHaveLength(1));

    await clickDay(15);
    await clickDay(12);

    expect(screen.getByText("Kliknij dzień wyjazdu")).toBeTruthy();
    expect(screen.queryByText(/→/)).toBeNull();
  });

  it("trzecie kliknięcie zaczyna nowy zakres", async () => {
    renderCalendar();
    await waitFor(() => expect(requests).toHaveLength(1));

    await clickDay(12);
    await clickDay(15);
    await clickDay(20);

    expect(screen.getByText("Kliknij dzień wyjazdu")).toBeTruthy();
  });

  // Uwaga do obu testów poniżej: przeszłość i brak miejsc są blokowane
  // DWUKROTNIE — atrybutem `disabled` na przycisku i wartownikiem w obsłudze
  // kliknięcia. Zabezpieczenia są wzajemnie redundantne, więc żaden test nie
  // przypnie pojedynczego z nich (zdjęcie jednego nie zmienia zachowania).
  // Sprawdzone mutacją: dopiero usunięcie OBU wywala te dwa testy.
  it("dni przeszłe są zablokowane", async () => {
    renderCalendar();
    await waitFor(() => expect(requests).toHaveLength(1));

    await clickDay(5); // 5 sierpnia, „dziś" to 10

    expect(screen.getByText("Kliknij dzień przyjazdu")).toBeTruthy();
  });

  it("dni bez wolnych miejsc są zablokowane", async () => {
    respondWith = () => ({
      ok: true,
      days: augustDays({ "2026-08-12": { free: 0 } }),
    });
    renderCalendar();
    await waitFor(() => expect(requests).toHaveLength(1));

    await clickDay(12);

    expect(screen.getByText("Kliknij dzień przyjazdu")).toBeTruthy();
  });

  it("zajęty dzień nie pokazuje ceny", async () => {
    // cena przy dniu, którego nie da się kupić, tylko wprowadza w błąd
    respondWith = () => ({
      ok: true,
      days: augustDays({ "2026-08-12": { free: 0, priceGr: 99900 } }),
    });
    renderCalendar();

    await waitFor(() => expect(screen.getAllByText("200 zł").length).toBeGreaterThan(0));
    expect(screen.queryByText("999 zł")).toBeNull();
  });

  it("zmiana typu pokoju czyści wybrany termin", async () => {
    // stary zakres mógłby być niedostępny w innym typie pokoju
    renderCalendar();
    await waitFor(() => expect(requests).toHaveLength(1));
    await clickDay(12);
    await clickDay(15);

    await userEvent.selectOptions(screen.getByLabelText("Wybierz pokój"), "8");

    await waitFor(() => expect(screen.getByText("Kliknij dzień przyjazdu")).toBeTruthy());
  });
});

describe("przejście do rezerwacji", () => {
  it("bez pełnego zakresu nie ma przycisku rezerwacji", async () => {
    renderCalendar();
    await waitFor(() => expect(requests).toHaveLength(1));

    expect(screen.queryByText(LABELS.bookThese)).toBeNull();

    await clickDay(12);
    expect(screen.queryByText(LABELS.bookThese)).toBeNull();
  });

  it("pełny zakres daje link do rezerwacji z terminem i typem pokoju", async () => {
    // adres wskazuje aplikację, nie stronę WWW — finalizacja idzie tam
    renderCalendar();
    await waitFor(() => expect(requests).toHaveLength(1));

    await clickDay(12);
    await clickDay(15);

    const link = screen.getByText(LABELS.bookThese);
    expect(link.getAttribute("href")).toBe(
      "https://rezflow.pl/rezerwuj/7?from=2026-08-12&to=2026-08-15&guests=2"
    );
  });

  it("prefiks języka z bookPath trafia do adresu", async () => {
    // gość na angielskiej wersji strony ma zostać w swoim języku
    render(
      <AvailabilityCalendar
        unitTypes={UNIT_TYPES}
        appUrl="https://rezflow.pl"
        bookPath="/en/rezerwuj"
        labels={LABELS}
      />
    );
    await waitFor(() => expect(requests).toHaveLength(1));

    await clickDay(12);
    await clickDay(15);

    expect(screen.getByText(LABELS.bookThese).getAttribute("href")).toContain(
      "/en/rezerwuj/7"
    );
  });
});
