// Klient HTTP SmartRate (Rezio.Api). Trzy niezgodności kontraktu żyją
// wyłącznie tutaj: złotówki ↔ grosze, „to" włącznie ↔ przedział półotwarty,
// JSON snake_case ↔ camelCase. Reszta RezFlow widzi już własne typy.
import { assertPublicUrl } from "../net";
import type { Market, QuoteInput, RateDay, RatesProvider } from "./provider";

const TIMEOUT_MS = 5000;

function num(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`SmartRate: pole ${field} nie jest liczbą`);
  }
  return value;
}

/** Mapowanie jednej doby z odpowiedzi POST /v1/quote. */
export function mapQuoteDay(raw: unknown): RateDay {
  const d = raw as Record<string, unknown>;
  if (typeof d.date !== "string") throw new Error("SmartRate: brak pola date");
  const c = (d.components ?? {}) as Record<string, unknown>;
  const clamped = typeof d.clamped_by === "string" ? d.clamped_by : null;
  return {
    date: d.date,
    priceGr: Math.round(num(d.recommended_price, "recommended_price") * 100),
    clampedBy: clamped?.startsWith("min") ? "min" : clamped?.startsWith("max") ? "max" : null,
    demandScore: typeof d.demand_score === "number" ? Math.round(d.demand_score) : 50,
    drivers: Array.isArray(d.demand_drivers) ? d.demand_drivers.map(String) : [],
    components: {
      season: typeof c.season === "number" ? c.season : 1,
      dayOfWeek: typeof c.day_of_week === "number" ? c.day_of_week : 1,
      leadTime: typeof c.lead_time === "number" ? c.lead_time : 1,
      occupancy: typeof c.market_occupancy === "number" ? c.market_occupancy : 1,
      demand: typeof c.demand === "number" ? c.demand : 1,
    },
  };
}

export class SmartRateClient implements RatesProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string
  ) {}

  private async call(path: string, body?: unknown): Promise<unknown> {
    // ten sam guard co przy feedach iCal — adres z konfiguracji nie może
    // wskazywać na sieć prywatną
    const url = await assertPublicUrl(`${this.baseUrl.replace(/\/$/, "")}${path}`);
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(this.apiKey ? { "X-Api-Key": this.apiKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      // API zwraca problem+json — wyciągamy detail/title do komunikatu w panelu
      const problem = (await res.json().catch(() => null)) as
        | { title?: string; detail?: string }
        | null;
      const reason = problem?.detail || problem?.title || res.statusText;
      throw new Error(`SmartRate ${res.status}: ${reason}`);
    }
    return res.json();
  }

  async markets(): Promise<Market[]> {
    const data = (await this.call("/v1/markets")) as { markets?: unknown };
    const list = Array.isArray(data.markets) ? data.markets : [];
    return list.map((m) => {
      const r = m as Record<string, unknown>;
      return {
        id: String(r.id ?? ""),
        name: String(r.name ?? ""),
        type: String(r.type ?? ""),
        voivodeship: String(r.voivodeship ?? ""),
      };
    });
  }

  async quote(input: QuoteInput): Promise<RateDay[]> {
    const data = (await this.call("/v1/quote", {
      market_id: input.marketId,
      base_price: input.basePriceGr / 100,
      min_price: input.minPriceGr / 100,
      max_price: input.maxPriceGr / 100,
      from: input.from,
      to: input.to, // API traktuje „to" włącznie — tak samo jak QuoteInput
    })) as { days?: unknown };
    const days = Array.isArray(data.days) ? data.days : [];
    return days.map(mapQuoteDay);
  }
}
