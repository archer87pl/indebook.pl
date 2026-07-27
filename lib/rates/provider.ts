// Abstrakcja silnika cen dynamicznych (jak ChannelProvider i DomainProvider):
// interfejs + deterministyczny stub do dev/testów + realny klient SmartRate
// wybierany po env. Wszystko po stronie RezFlow liczymy w groszach — konwersja
// na złotówki i z powrotem siedzi wyłącznie w kliencie HTTP.
import { isWeekendNight } from "../pricing";
import { addDaysISO, eachNight } from "../dates";
import { SmartRateClient } from "./smartrate";

/** Mnożniki, z których SmartRate składa cenę — do wyjaśnienia ceny w panelu. */
export type RateComponents = {
  season: number;
  dayOfWeek: number;
  leadTime: number;
  occupancy: number;
  demand: number;
};

export type RateDay = {
  date: string;
  priceGr: number;
  /** która granica widełek przycięła cenę */
  clampedBy: "min" | "max" | null;
  demandScore: number;
  drivers: string[];
  components: RateComponents;
};

export type QuoteInput = {
  marketId: string;
  basePriceGr: number;
  minPriceGr: number;
  maxPriceGr: number;
  /** pierwsza noc */
  from: string;
  /** ostatnia noc, WŁĄCZNIE (konwersja z checkOut robiona przez wołającego) */
  to: string;
};

export type Market = {
  id: string;
  name: string;
  type: string;
  voivodeship: string;
};

export interface RatesProvider {
  markets(): Promise<Market[]>;
  quote(input: QuoteInput): Promise<RateDay[]>;
}

const NEUTRAL: RateComponents = {
  season: 1,
  dayOfWeek: 1,
  leadTime: 1,
  occupancy: 1,
  demand: 1,
};

/**
 * Stub: weekend ×1,15 i clamp do widełek. Celowo NIE patrzy na zegar (żadnego
 * last-minute), żeby wynik był w pełni deterministyczny — inaczej testy
 * psułyby się wraz z upływem czasu. Dev, vitest i Playwright działają dzięki
 * temu bez dockera z .NET.
 */
export const stubProvider: RatesProvider = {
  async markets() {
    return [
      { id: "mkt_gdansk", name: "Gdańsk", type: "Seaside", voivodeship: "pomorskie" },
      { id: "mkt_zakopane", name: "Zakopane", type: "Mountains", voivodeship: "małopolskie" },
    ];
  },
  async quote(input) {
    // eachNight jest półotwarte, a QuoteInput.to jest włącznie
    return eachNight(input.from, addDaysISO(input.to, 1)).map((date) => {
      const dayOfWeek = isWeekendNight(date) ? 1.15 : 1;
      const raw = Math.round(input.basePriceGr * dayOfWeek);
      let priceGr = raw;
      let clampedBy: "min" | "max" | null = null;
      if (raw > input.maxPriceGr) {
        priceGr = input.maxPriceGr;
        clampedBy = "max";
      } else if (raw < input.minPriceGr) {
        priceGr = input.minPriceGr;
        clampedBy = "min";
      }
      return {
        date,
        priceGr,
        clampedBy,
        demandScore: 50,
        drivers: [],
        components: { ...NEUTRAL, dayOfWeek },
      };
    });
  },
};

/**
 * Wybór providera: SMARTRATE_STUB=1 → stub (dev/testy); w przeciwnym razie
 * realny klient, gdy ustawiony SMARTRATE_URL; inaczej null → tryb SmartRate
 * ukryty w panelu (wzorzec jak Channex/P24/Vercel).
 */
export function ratesProvider(): RatesProvider | null {
  if (process.env.SMARTRATE_STUB === "1") return stubProvider;
  const baseUrl = process.env.SMARTRATE_URL;
  if (!baseUrl) return null;
  return new SmartRateClient(baseUrl, process.env.SMARTRATE_API_KEY ?? "");
}

/** Czy integracja cen dynamicznych jest w ogóle skonfigurowana (jak channelProvider). */
export function smartRateConfigured(): boolean {
  return ratesProvider() !== null;
}
