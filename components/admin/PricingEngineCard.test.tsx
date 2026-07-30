// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { Market } from "@/lib/rates/provider";
import PricingEngineCard from "./PricingEngineCard";

// Sekcja „Silnik cen" w cenniku. Karta ma trzy zupełnie różne wersje zależne
// od planu i od tego, czy integracja w ogóle istnieje na wdrożeniu — pomyłka
// w wyborze wersji albo zamyka właściciela w pętli („wybierz rynek" przy
// pustej liście), albo obiecuje funkcję spoza jego planu. W wersji pełnej
// najwięcej wartości niesie tabela rekomendacji: to jedyne miejsce, gdzie
// widać, DLACZEGO doba kosztuje tyle, ile kosztuje.

vi.mock("@/lib/actions", () => ({
  saveRateGuards: vi.fn(),
  setPricingMode: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: false }),
}));

const MARKETS: Market[] = [
  { id: "mkt_zakopane", name: "Zakopane", type: "mountain", voivodeship: "małopolskie" },
  { id: "mkt_krakow", name: "Kraków", type: "city", voivodeship: "małopolskie" },
  { id: "mkt_sopot", name: "Sopot", type: "sea", voivodeship: "pomorskie" },
];

type UnitTypeRow = Parameters<typeof PricingEngineCard>[0]["unitTypes"][number];

const UNIT_TYPES: UnitTypeRow[] = [
  { id: 7, name: "Pokój Standard", basePriceGr: 28000, minPriceGr: 20000, maxPriceGr: 45000 },
];

const rate = (over: Partial<Parameters<typeof PricingEngineCard>[0]["rates"][number]> = {}) => ({
  unitTypeId: 7,
  date: "2026-08-10",
  priceGr: 31500,
  clampedBy: null,
  demandScore: 62,
  drivers: JSON.stringify([]),
  components: JSON.stringify({ season: 1.2, dayOfWeek: 1, leadTime: 1, occupancy: 1, demand: 1 }),
  ...over,
});

const property = (over: Record<string, unknown> = {}) => ({
  plan: "PRO",
  pricingMode: "SMARTRATE",
  smartRateMarketId: "mkt_zakopane",
  smartRateSyncedAt: null,
  smartRateError: "",
  ...over,
});

const renderCard = (over: {
  property?: Record<string, unknown>;
  markets?: Market[];
  enabled?: boolean;
  unitTypes?: UnitTypeRow[];
  rates?: ReturnType<typeof rate>[];
} = {}) =>
  render(
    <PricingEngineCard
      property={property(over.property) as never}
      markets={over.markets ?? MARKETS}
      enabled={over.enabled ?? true}
      unitTypes={over.unitTypes ?? UNIT_TYPES}
      rates={over.rates ?? [rate()]}
    />,
  );

afterEach(cleanup);

describe("wersja karty", () => {
  it("plan bez SmartRate dostaje opis funkcji i drogę do planów", () => {
    renderCard({ property: { plan: "STANDARD" } });

    expect(screen.getByRole("link", { name: /plany od Pro/i }).getAttribute("href")).toBe(
      "/admin/plan",
    );
    expect(screen.queryByLabelText("Silnik")).toBeNull();
  });

  it("plan Pro bez skonfigurowanej integracji nie dostaje przełącznika", () => {
    // pokazanie wyboru rynku przy pustej liście zamykało właściciela w pętli
    renderCard({ enabled: false });

    expect(screen.getByText(/nie są skonfigurowane na tym wdrożeniu/)).toBeTruthy();
    expect(screen.queryByLabelText("Rynek")).toBeNull();
    expect(screen.queryByRole("link", { name: /plany od Pro/i })).toBeNull();
  });

  it("brak planu ma pierwszeństwo nad brakiem integracji", () => {
    // niższy plan i tak nie zobaczy przełącznika — komunikat ma mówić o planie,
    // a nie o konfiguracji wdrożenia, na którą właściciel nie ma wpływu
    renderCard({ property: { plan: "FREE" }, enabled: false });

    expect(screen.getByRole("link", { name: /plany od Pro/i })).toBeTruthy();
  });

  it("plan Pro z integracją dostaje pełny przełącznik", () => {
    renderCard();

    expect(screen.getByLabelText("Silnik")).toBeTruthy();
    expect(screen.getByLabelText("Rynek")).toBeTruthy();
  });

  it("podtytuł mówi, który silnik liczy ceny", () => {
    // uwaga: „Podstawowy (reguły)" to nazwa OPCJI w liście — podtytuł
    // karty ma własne brzmienie i to on świadczy o stanie
    renderCard({ property: { pricingMode: "BASIC" } });
    expect(screen.getByText("Podstawowy (reguły poniżej)")).toBeTruthy();

    cleanup();
    renderCard();
    expect(screen.getByText(/SmartRate \(ceny dynamiczne\)/)).toBeTruthy();
  });
});

describe("wybór silnika i rynku", () => {
  it("wybrany silnik i rynek są zaznaczone w formularzu", () => {
    // bez tego zapis „zapamiętaj" cofałby ustawienie do pierwszej opcji
    renderCard({ property: { pricingMode: "SMARTRATE", smartRateMarketId: "mkt_sopot" } });

    expect(screen.getByLabelText<HTMLSelectElement>("Silnik").value).toBe("SMARTRATE");
    expect(screen.getByLabelText<HTMLSelectElement>("Rynek").value).toBe("mkt_sopot");
  });

  it("rynki są pogrupowane po województwach", () => {
    // lista bywa długa — bez grup właściciel szuka swojego miasta w kilkudziesięciu
    renderCard();

    const groups = Array.from(
      screen.getByLabelText("Rynek").querySelectorAll("optgroup"),
    ).map((g) => g.getAttribute("label"));
    expect(groups).toEqual(["małopolskie", "pomorskie"]);
  });

  it("rynki z jednego województwa trafiają do tej samej grupy", () => {
    renderCard();

    const malopolskie = screen.getByLabelText("Rynek").querySelector("optgroup")!;
    expect(Array.from(malopolskie.querySelectorAll("option")).map((o) => o.value)).toEqual([
      "mkt_zakopane",
      "mkt_krakow",
    ]);
  });

  it("pusty wybór jest możliwy, bo obiekt może nie mieć jeszcze rynku", () => {
    renderCard({ property: { smartRateMarketId: "" } });

    expect(screen.getByLabelText<HTMLSelectElement>("Rynek").value).toBe("");
    expect(screen.getByText("— wybierz —")).toBeTruthy();
  });

  it("data ostatniego pobrania pokazuje się tylko wtedy, gdy coś pobrano", () => {
    renderCard({ property: { smartRateSyncedAt: new Date("2026-07-30T09:15:00Z") } });

    expect(screen.getByText(/2026-07-30 09:15/)).toBeTruthy();
  });

  it("bez pobrania nie ma pustego wiersza „Ostatnie pobranie”", () => {
    renderCard();

    expect(screen.queryByText(/Ostatnie pobranie/)).toBeNull();
  });
});

describe("błąd silnika", () => {
  it("jest pokazany razem z informacją, co się dzieje z cenami", () => {
    // sam komunikat błędu zostawiłby pytanie „to po ile mam teraz sprzedawać?"
    renderCard({ property: { smartRateError: "SmartRate HTTP 503" } });

    expect(screen.getByText(/SmartRate HTTP 503/)).toBeTruthy();
    expect(screen.getByText(/liczą się z reguł poniżej/)).toBeTruthy();
  });

  it("bez błędu nie ma alertu", () => {
    renderCard();

    expect(document.querySelector(".alert-error")).toBeNull();
  });
});

describe("widełki i rekomendacje", () => {
  it("tryb podstawowy nie pokazuje widełek ani rekomendacji", () => {
    // reguły cennika liczą się bez nich — pokazywanie ich sugerowałoby wpływ
    renderCard({ property: { pricingMode: "BASIC" } });

    expect(screen.queryByLabelText(/Cena min/)).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("widełki są przeliczone z groszy na złote, po polsku", () => {
    renderCard();

    expect(screen.getByLabelText<HTMLInputElement>(/Cena min/).value).toBe("200");
    expect(screen.getByLabelText<HTMLInputElement>(/Cena maks/).value).toBe("450");
  });

  it("część groszowa idzie z przecinkiem, nie kropką", () => {
    renderCard({
      unitTypes: [{ id: 7, name: "Pokój", basePriceGr: 1, minPriceGr: 19950, maxPriceGr: 45050 }],
    });

    expect(screen.getByLabelText<HTMLInputElement>(/Cena min/).value).toBe("199,5");
  });

  it("brak widełek pokazuje zero, a nie puste pole", () => {
    renderCard({
      unitTypes: [{ id: 7, name: "Pokój", basePriceGr: 28000, minPriceGr: null, maxPriceGr: null }],
    });

    expect(screen.getByLabelText<HTMLInputElement>(/Cena min/).value).toBe("0");
  });

  it("formularz widełek niesie identyfikator typu pokoju", () => {
    // wspólna akcja dla wszystkich typów — bez id zapisałaby się cudza cena
    renderCard();

    const hidden = document.querySelector<HTMLInputElement>('input[name="unitTypeId"]')!;
    expect(hidden.value).toBe("7");
  });

  it("każdy typ pokoju dostaje własną sekcję", () => {
    renderCard({
      unitTypes: [
        ...UNIT_TYPES,
        { id: 8, name: "Apartament", basePriceGr: 50000, minPriceGr: null, maxPriceGr: null },
      ],
    });

    expect(screen.getByText("Pokój Standard")).toBeTruthy();
    expect(screen.getByText("Apartament")).toBeTruthy();
  });

  it("rekomendacje trafiają do właściwego typu pokoju", () => {
    // wymieszane rekomendacje pokazałyby ceny apartamentu przy standardzie
    renderCard({
      unitTypes: [
        ...UNIT_TYPES,
        { id: 8, name: "Apartament", basePriceGr: 50000, minPriceGr: null, maxPriceGr: null },
      ],
      rates: [rate({ unitTypeId: 8, date: "2026-09-01" })],
    });

    const tables = screen.getAllByRole("table");
    expect(tables).toHaveLength(1);
    expect(within(tables[0]).getByText("2026-09-01")).toBeTruthy();
    expect(screen.getByText(/Rekomendacje pobiorą się w tle/)).toBeTruthy();
  });

  it("puste rekomendacje tłumaczą, że to stan przejściowy", () => {
    renderCard({ rates: [] });

    expect(screen.getByText(/Rekomendacje pobiorą się w tle/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("doby idą chronologicznie, nie w kolejności z bazy", () => {
    renderCard({
      rates: [rate({ date: "2026-08-12" }), rate({ date: "2026-08-10" }), rate({ date: "2026-08-11" })],
    });

    const dates = screen.getAllByRole("row").slice(1).map((r) => r.children[0].textContent);
    expect(dates).toEqual(["2026-08-10", "2026-08-11", "2026-08-12"]);
  });

  it("pokazuje najbliższe 30 dób, nie cały horyzont", () => {
    // horyzont rekomendacji jest dłuższy; tabela na 400 wierszy jest bezużyteczna
    const many = Array.from({ length: 40 }, (_, i) =>
      rate({ date: `2026-08-${String(i + 1).padStart(2, "0")}` }),
    );

    renderCard({ rates: many });

    expect(screen.getAllByRole("row")).toHaveLength(31); // nagłówek + 30 dób
  });
});

describe("rozbicie ceny", () => {
  it("wypisuje tylko mnożniki, które faktycznie ruszyły cenę", () => {
    // mnożnik ×1.00 nic nie wnosi — pięć takich w każdym wierszu zasłania ten,
    // który zadziałał
    renderCard({
      rates: [
        rate({
          components: JSON.stringify({
            season: 1.25,
            dayOfWeek: 1,
            leadTime: 0.9,
            occupancy: 1,
            demand: 1,
          }),
        }),
      ],
    });

    const why = screen.getAllByRole("row")[1].children[3].textContent;
    expect(why).toBe("sezon ×1.25 · wyprzedzenie ×0.90");
  });

  it("dokłada powody słowne od silnika", () => {
    renderCard({
      rates: [rate({ drivers: JSON.stringify(["długi weekend", "koncert w mieście"]) })],
    });

    expect(screen.getAllByRole("row")[1].children[3].textContent).toContain(
      "— długi weekend, koncert w mieście",
    );
  });

  it("brak powodów nie zostawia wiszącego myślnika", () => {
    renderCard();

    expect(screen.getAllByRole("row")[1].children[3].textContent).not.toContain("—");
  });

  it("obcięcie do widełek jest oznaczone i mówi, w którą stronę", () => {
    // bez tego właściciel widzi cenę inną niż wyliczona i nie wie dlaczego
    renderCard({ rates: [rate({ clampedBy: "max" })] });
    expect(screen.getByText("obcięte do maks.")).toBeTruthy();

    cleanup();
    renderCard({ rates: [rate({ clampedBy: "min" })] });
    expect(screen.getByText("podbite do min.")).toBeTruthy();
  });

  it("cena bez obcięcia nie ma pigułki", () => {
    renderCard();

    expect(screen.queryByText(/obcięte|podbite/)).toBeNull();
  });

  it("cena i popyt są w wierszu doby", () => {
    renderCard({ rates: [rate({ priceGr: 31500, demandScore: 62 })] });

    const cells = screen.getAllByRole("row")[1].children;
    expect(cells[1].textContent).toContain("315");
    expect(cells[2].textContent).toBe("62");
  });
});
