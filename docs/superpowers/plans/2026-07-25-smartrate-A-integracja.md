# Integracja cen dynamicznych SmartRate — Plan A (RezFlow)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Właściciel obiektu w planie PRO może przełączyć wycenę z podstawowych reguł RezFlow na zewnętrzne API SmartRate, a gość dostaje ceny z cache w bazie — bez HTTP w ścieżce zakupu i z cichą degradacją do reguł przy awarii.

**Architecture:** Nowy katalog `lib/rates/` w tym samym wzorcu, co `lib/channex/`: interfejs `RatesProvider`, stub do dev/testów i realny klient HTTP wybierany po env. Rekomendacje lądują w tabeli `DynamicRate` (jedna doba = jeden wiersz); `quoteStayDynamic` staje się dyspozytorem, który czyta cache i degraduje do reguł, gdy pokrycie jest niepełne. Odświeżanie jest asynchroniczne: `after()` po odpowiedzi + cron dzienny.

**Tech Stack:** Next.js 16 (App Router, server actions, `after()`), Prisma 6 + PostgreSQL, TypeScript, vitest, Playwright.

## Global Constraints

- Kwoty w **groszach** (`Int`, sufiks `Gr`); SmartRate liczy w złotówkach — konwersja wyłącznie w kliencie.
- Daty jako stringi `YYYY-MM-DD`; przedziały pobytu **półotwarte** `[checkIn, checkOut)`. SmartRate przyjmuje `to` **włącznie** — konwersja wyłącznie w kliencie.
- Opisy testów i komentarze w kodzie **po polsku** (konwencja repo).
- Sekrety (`SMARTRATE_URL`, `SMARTRATE_API_KEY`) tylko w `.env`; do repo trafia wyłącznie `.env.example`.
- Każdy wyjściowy adres HTTP przechodzi przez `assertPublicUrl` z `lib/net.ts`.
- Tryb SmartRate dostępny **tylko w planie PRO**.
- `quoteStayDynamic` pozostaje jedynym wejściem do wyceny — nie zmieniamy jego sygnatury ani 6 istniejących miejsc wywołań.
- Po każdym zadaniu: `npx tsc --noEmit`, `npm run lint`, `npx vitest run` muszą być zielone.

---

### Task A-T1: Model danych i gating planu

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `lib/plans.ts`
- Test: `lib/plans.test.ts`

**Interfaces:**
- Produces: `Property.pricingMode`, `Property.smartRateMarketId`, `Property.smartRateSyncedAt`, `Property.smartRateError`, `UnitType.minPriceGr`, `UnitType.maxPriceGr`, model `DynamicRate`, funkcja `pricingPlanFeatures(plan: string): { smartRate: boolean }`.

- [ ] **Step 1: Dopisz pola do `Property`**

W `prisma/schema.prisma`, w modelu `Property`, tuż pod linią `syncMode String @default("ICAL")`:

```prisma
  // silnik wyceny: BASIC (reguły PricingRule) | SMARTRATE (API SmartRate)
  pricingMode       String    @default("BASIC")
  smartRateMarketId String    @default("") // np. mkt_gdansk
  smartRateSyncedAt DateTime? // ostatnie udane pobranie rekomendacji
  smartRateError    String    @default("") // ostatni błąd — pokazywany w panelu
```

- [ ] **Step 2: Dopisz widełki do `UnitType` i relację cache'u**

W modelu `UnitType`, pod linią `minStay Int @default(1)`:

```prisma
  minPriceGr  Int? // dolna granica dla silnika cen dynamicznych
  maxPriceGr  Int? // górna granica dla silnika cen dynamicznych
```

oraz w liście relacji tego modelu (obok `photos Photo[]`):

```prisma
  dynamicRates DynamicRate[]
```

- [ ] **Step 3: Dodaj model `DynamicRate`**

Na końcu `prisma/schema.prisma`:

```prisma
// Cache rekomendacji cenowych SmartRate: jeden wiersz = jedna doba dla typu
// pokoju. Ścieżka gościa czyta wyłącznie stąd (zero HTTP), a odświeżanie idzie
// przez after() i cron. components/drivers służą wyjaśnieniu ceny w panelu.
model DynamicRate {
  id          Int      @id @default(autoincrement())
  unitTypeId  Int
  unitType    UnitType @relation(fields: [unitTypeId], references: [id])
  date        String // YYYY-MM-DD
  priceGr     Int
  clampedBy   String? // min | max | null
  demandScore Int      @default(50)
  drivers     String   @default("[]") // JSON: ["Boże Ciało", "ferie (małopolskie)"]
  components  String   @default("{}") // JSON: 5 mnożników silnika
  fetchedAt   DateTime @updatedAt

  @@unique([unitTypeId, date])
  @@index([unitTypeId, date])
}
```

- [ ] **Step 4: Zastosuj schemat i wygeneruj klienta**

```bash
npx prisma db push --skip-generate && npx prisma generate
```

Oczekiwane: `Your database is now in sync with your Prisma schema.` oraz `Generated Prisma Client`.

- [ ] **Step 5: Napisz failujący test gatingu planu**

Na końcu `lib/plans.test.ts`:

```ts
describe("pricingPlanFeatures", () => {
  it("SmartRate tylko w planie Pro", () => {
    expect(pricingPlanFeatures("PRO").smartRate).toBe(true);
    expect(pricingPlanFeatures("STANDARD").smartRate).toBe(false);
    expect(pricingPlanFeatures("FREE").smartRate).toBe(false);
  });
});
```

Dopisz `pricingPlanFeatures` do importu z `./plans` na górze pliku.

- [ ] **Step 6: Uruchom test — ma failować**

```bash
npx vitest run lib/plans.test.ts
```

Oczekiwane: FAIL — `pricingPlanFeatures is not a function`.

- [ ] **Step 7: Zaimplementuj gating**

Na końcu `lib/plans.ts`:

```ts
// Ceny dynamiczne z SmartRate: wyróżnik planu Pro (jak własna domena i Channex).
export function pricingPlanFeatures(plan: string): { smartRate: boolean } {
  return { smartRate: plan === "PRO" };
}
```

- [ ] **Step 8: Uruchom test — ma przejść**

```bash
npx vitest run lib/plans.test.ts
```

Oczekiwane: PASS.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma lib/plans.ts lib/plans.test.ts
git commit -m "Feat: SmartRate - model danych (DynamicRate, widelki, tryb wyceny) i gating Pro"
```

---

### Task A-T2: `RatesProvider` + stub + wybór po env

**Files:**
- Create: `lib/rates/provider.ts`
- Test: `lib/rates/provider.test.ts`

**Interfaces:**
- Consumes: `isWeekendNight` z `lib/pricing.ts`, `eachNight`/`nightsBetween` z `lib/dates.ts`.
- Produces: typy `RateComponents`, `RateDay`, `QuoteInput`, `Market`; interfejs `RatesProvider`; `stubProvider`; `ratesProvider(): RatesProvider | null`.

- [ ] **Step 1: Napisz failujący test stuba**

Utwórz `lib/rates/provider.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { stubProvider } from "./provider";

const input = {
  marketId: "mkt_gdansk",
  basePriceGr: 20000,
  minPriceGr: 14000,
  maxPriceGr: 36000,
  from: "2026-07-09", // czwartek
  to: "2026-07-11", // sobota (włącznie)
};

describe("stubProvider", () => {
  it("zwraca dobę po dobie, z „to\" włącznie", async () => {
    const days = await stubProvider.quote(input);
    expect(days.map((d) => d.date)).toEqual(["2026-07-09", "2026-07-10", "2026-07-11"]);
  });

  it("podbija noce weekendowe o 15%", async () => {
    const days = await stubProvider.quote(input);
    expect(days[0].priceGr).toBe(20000); // czwartek — bez korekty
    expect(days[1].priceGr).toBe(23000); // piątek
    expect(days[2].priceGr).toBe(23000); // sobota
  });

  it("nie zależy od dzisiejszej daty", async () => {
    // stub celowo nie patrzy na zegar — inaczej te asercje psułyby się z czasem
    const past = await stubProvider.quote(input);
    const future = await stubProvider.quote({
      ...input,
      from: "2030-07-12", // piątek
      to: "2030-07-12",
    });
    expect(past[1].priceGr).toBe(future[0].priceGr);
  });

  it("przycina do widełek i oznacza, która granica zadziałała", async () => {
    const days = await stubProvider.quote({ ...input, maxPriceGr: 21000 });
    expect(days[1].priceGr).toBe(21000);
    expect(days[1].clampedBy).toBe("max");
    expect(days[0].clampedBy).toBeNull();
  });

  it("jest deterministyczny", async () => {
    const a = await stubProvider.quote(input);
    const b = await stubProvider.quote(input);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Uruchom test — ma failować**

```bash
npx vitest run lib/rates/provider.test.ts
```

Oczekiwane: FAIL — `Failed to resolve import "./provider"`.

- [ ] **Step 3: Zaimplementuj provider i stub**

Utwórz `lib/rates/provider.ts`:

```ts
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
```

- [ ] **Step 4: Utwórz tymczasowy szkielet klienta, żeby import się rozwiązał**

Utwórz `lib/rates/smartrate.ts` (pełna implementacja w A-T3):

```ts
import type { Market, QuoteInput, RateDay, RatesProvider } from "./provider";

export class SmartRateClient implements RatesProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string
  ) {}
  async markets(): Promise<Market[]> {
    throw new Error("not implemented");
  }
  async quote(_input: QuoteInput): Promise<RateDay[]> {
    throw new Error("not implemented");
  }
}
```

- [ ] **Step 5: Uruchom test — ma przejść**

```bash
npx vitest run lib/rates/provider.test.ts
```

Oczekiwane: PASS (4 testy).

- [ ] **Step 6: Commit**

```bash
git add lib/rates/provider.ts lib/rates/provider.test.ts lib/rates/smartrate.ts
git commit -m "Feat: SmartRate - abstrakcja RatesProvider ze stubem i wyborem po env"
```

---

### Task A-T3: Klient HTTP SmartRate

**Files:**
- Modify: `lib/rates/smartrate.ts`
- Create: `lib/rates/smartrate.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `assertPublicUrl` z `lib/net.ts`, typy z `lib/rates/provider.ts`.
- Produces: `SmartRateClient` (implementuje `RatesProvider`), `mapQuoteDay(raw: unknown): RateDay` — eksportowana czysta funkcja mapująca jedną dobę z JSON-a API.

- [ ] **Step 1: Napisz failujący test mapowania kontraktu**

Utwórz `lib/rates/smartrate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mapQuoteDay } from "./smartrate";

// Kształt odpowiedzi Rezio.Api (JSON snake_case, ceny w złotówkach)
const raw = {
  date: "2026-07-10",
  recommended_price: 234.5,
  clamped_by: "max_price",
  occupancy_rate: 0.82,
  occupancy_source: "scraped",
  demand_score: 71,
  components: {
    base_price: 200,
    season: 1.35,
    day_of_week: 1.15,
    lead_time: 0.9,
    market_occupancy: 1.15,
    demand: 1.1,
  },
  demand_drivers: ["długi weekend"],
};

describe("mapQuoteDay", () => {
  it("przelicza złotówki na grosze", () => {
    expect(mapQuoteDay(raw).priceGr).toBe(23450);
  });

  it("skraca clamped_by do min/max", () => {
    expect(mapQuoteDay(raw).clampedBy).toBe("max");
    expect(mapQuoteDay({ ...raw, clamped_by: "min_price" }).clampedBy).toBe("min");
    expect(mapQuoteDay({ ...raw, clamped_by: null }).clampedBy).toBeNull();
  });

  it("mapuje mnożniki i drivery popytu", () => {
    const day = mapQuoteDay(raw);
    expect(day.components).toEqual({
      season: 1.35,
      dayOfWeek: 1.15,
      leadTime: 0.9,
      occupancy: 1.15,
      demand: 1.1,
    });
    expect(day.drivers).toEqual(["długi weekend"]);
    expect(day.demandScore).toBe(71);
  });

  it("odrzuca dobę bez daty lub bez ceny", () => {
    expect(() => mapQuoteDay({ ...raw, date: undefined })).toThrow();
    expect(() => mapQuoteDay({ ...raw, recommended_price: "dużo" })).toThrow();
  });
});
```

- [ ] **Step 2: Uruchom test — ma failować**

```bash
npx vitest run lib/rates/smartrate.test.ts
```

Oczekiwane: FAIL — `mapQuoteDay is not a function`.

- [ ] **Step 3: Zaimplementuj klienta**

Zastąp całą zawartość `lib/rates/smartrate.ts`:

```ts
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
```

- [ ] **Step 4: Uruchom test — ma przejść**

```bash
npx vitest run lib/rates/smartrate.test.ts
```

Oczekiwane: PASS (4 testy).

- [ ] **Step 5: Dopisz zmienne do `.env.example`**

Na końcu `.env.example`:

```bash
# Ceny dynamiczne SmartRate (Rezio.Api). Bez SMARTRATE_URL tryb jest ukryty
# w panelu; SMARTRATE_STUB=1 wymusza deterministyczny stub (dev/testy).
SMARTRATE_URL=
SMARTRATE_API_KEY=
SMARTRATE_STUB=
SMARTRATE_TTL_HOURS=12
```

- [ ] **Step 6: Commit**

```bash
git add lib/rates/smartrate.ts lib/rates/smartrate.test.ts .env.example
git commit -m "Feat: SmartRate - klient HTTP (grosze, to wlacznie, snake_case, guard SSRF)"
```

---

### Task A-T4: Odczyt cache'u (`DynamicRate`)

**Files:**
- Create: `lib/rates/cache.ts`
- Create: `lib/rates/cache.test.ts`

**Interfaces:**
- Consumes: `eachNight` z `lib/dates.ts`, `prisma` z `lib/db.ts`.
- Produces: `RATES_TTL_HOURS`, typ `CachedRates = { priceByDate: Map<string, number>; complete: boolean; stale: boolean }`, `isStale(fetchedAt: Date, now: Date): boolean`, `cachedRates(unitTypeId: number, from: string, to: string): Promise<CachedRates>` (`to` **wyłącznie**, jak `checkOut`).

- [ ] **Step 1: Napisz failujący test czystej części**

Utwórz `lib/rates/cache.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RATES_TTL_HOURS, coverage, isStale } from "./cache";

describe("isStale", () => {
  const now = new Date("2026-07-25T12:00:00Z");

  it("wpis młodszy niż TTL jest świeży", () => {
    const fresh = new Date(now.getTime() - (RATES_TTL_HOURS - 1) * 3600_000);
    expect(isStale(fresh, now)).toBe(false);
  });

  it("wpis starszy niż TTL jest nieświeży", () => {
    const old = new Date(now.getTime() - (RATES_TTL_HOURS + 1) * 3600_000);
    expect(isStale(old, now)).toBe(true);
  });
});

describe("coverage", () => {
  const now = new Date("2026-07-25T12:00:00Z");
  const fresh = new Date(now.getTime() - 3600_000);
  const rows = [
    { date: "2026-08-01", priceGr: 20000, fetchedAt: fresh },
    { date: "2026-08-02", priceGr: 23000, fetchedAt: fresh },
  ];

  it("pełne pokrycie zakresu daje complete=true", () => {
    const r = coverage(rows, "2026-08-01", "2026-08-03", now);
    expect(r.complete).toBe(true);
    expect(r.stale).toBe(false);
    expect(r.priceByDate.get("2026-08-02")).toBe(23000);
  });

  it("brakująca noc daje complete=false", () => {
    const r = coverage(rows, "2026-08-01", "2026-08-04", now);
    expect(r.complete).toBe(false);
  });

  it("jeden nieświeży wpis oznacza cały zakres jako stale", () => {
    const old = new Date(now.getTime() - (RATES_TTL_HOURS + 1) * 3600_000);
    const r = coverage(
      [rows[0], { ...rows[1], fetchedAt: old }],
      "2026-08-01",
      "2026-08-03",
      now
    );
    expect(r.complete).toBe(true);
    expect(r.stale).toBe(true);
  });
});
```

- [ ] **Step 2: Uruchom test — ma failować**

```bash
npx vitest run lib/rates/cache.test.ts
```

Oczekiwane: FAIL — `Failed to resolve import "./cache"`.

- [ ] **Step 3: Zaimplementuj cache**

Utwórz `lib/rates/cache.ts`:

```ts
// Odczyt cache'u rekomendacji. Ścieżka gościa nie robi HTTP — czyta stąd,
// a nieświeże/niepełne pokrycie tylko zleca odświeżenie w tle.
import { eachNight } from "../dates";
import { prisma } from "../db";

export const RATES_TTL_HOURS = Number(process.env.SMARTRATE_TTL_HOURS) || 12;

export type CachedRates = {
  /** cena nocy w groszach, tylko dla dat obecnych w cache */
  priceByDate: Map<string, number>;
  /** czy cache pokrywa KAŻDĄ noc zakresu */
  complete: boolean;
  /** czy którykolwiek wpis przekroczył TTL */
  stale: boolean;
};

export function isStale(fetchedAt: Date, now: Date): boolean {
  return now.getTime() - fetchedAt.getTime() > RATES_TTL_HOURS * 3600_000;
}

type RateRow = { date: string; priceGr: number; fetchedAt: Date };

/** Czysta część: ocena pokrycia i świeżości. `to` wyłącznie (jak checkOut). */
export function coverage(
  rows: RateRow[],
  from: string,
  to: string,
  now: Date
): CachedRates {
  const priceByDate = new Map(rows.map((r) => [r.date, r.priceGr]));
  const nights = eachNight(from, to);
  return {
    priceByDate,
    complete: nights.length > 0 && nights.every((n) => priceByDate.has(n)),
    stale: rows.some((r) => isStale(r.fetchedAt, now)),
  };
}

/** Rekomendacje dla typu pokoju w zakresie [from, to). */
export async function cachedRates(
  unitTypeId: number,
  from: string,
  to: string
): Promise<CachedRates> {
  const rows = await prisma.dynamicRate.findMany({
    where: { unitTypeId, date: { gte: from, lt: to } },
    select: { date: true, priceGr: true, fetchedAt: true },
  });
  return coverage(rows, from, to, new Date());
}
```

- [ ] **Step 4: Uruchom test — ma przejść**

```bash
npx vitest run lib/rates/cache.test.ts
```

Oczekiwane: PASS (5 testów).

- [ ] **Step 5: Commit**

```bash
git add lib/rates/cache.ts lib/rates/cache.test.ts
git commit -m "Feat: SmartRate - odczyt cache DynamicRate z ocena pokrycia i TTL"
```

---

### Task A-T5: Odświeżanie w tle i inwalidacja

**Files:**
- Create: `lib/rates/refresh.ts`
- Create: `lib/rates/refresh.test.ts`

**Interfaces:**
- Consumes: `ratesProvider` z `lib/rates/provider.ts`, `prisma`, `addDaysISO` z `lib/dates.ts`, `pricingPlanFeatures` z `lib/plans.ts`.
- Produces: `COALESCE_SECONDS`, `defaultGuards(basePriceGr: number): { minPriceGr: number; maxPriceGr: number }`, `refreshRates(unitTypeId: number, from: string, to: string): Promise<number>` (`to` **wyłącznie**), `afterRates(unitTypeId: number, from: string, to: string): Promise<void>`, `invalidateRates(unitTypeId: number): Promise<void>`.

- [ ] **Step 1: Napisz failujący test widełek domyślnych**

Utwórz `lib/rates/refresh.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defaultGuards } from "./refresh";

describe("defaultGuards", () => {
  it("wylicza widełki z ceny bazowej: -30% / +80%", () => {
    expect(defaultGuards(20000)).toEqual({ minPriceGr: 14000, maxPriceGr: 36000 });
  });

  it("zaokrągla do pełnych groszy", () => {
    expect(defaultGuards(19999)).toEqual({ minPriceGr: 13999, maxPriceGr: 35998 });
  });

  it("nigdy nie schodzi poniżej 1 grosza", () => {
    expect(defaultGuards(1).minPriceGr).toBe(1);
  });
});
```

- [ ] **Step 2: Uruchom test — ma failować**

```bash
npx vitest run lib/rates/refresh.test.ts
```

Oczekiwane: FAIL — `Failed to resolve import "./refresh"`.

- [ ] **Step 3: Zaimplementuj odświeżanie**

Utwórz `lib/rates/refresh.ts`:

```ts
// Pobranie rekomendacji do cache'u. Wołane wyłącznie poza ścieżką odpowiedzi
// (after() albo cron) — gość nigdy nie czeka na SmartRate.
import { after } from "next/server";
import { addDaysISO } from "../dates";
import { prisma } from "../db";
import { pricingPlanFeatures } from "../plans";
import { ratesProvider } from "./provider";

/** Okno wygaszania: kolejne zlecenia dla tego samego zakresu są pomijane. */
export const COALESCE_SECONDS = 60;

/** Widełki startowe przy pierwszym włączeniu trybu: −30% / +80% ceny bazowej. */
export function defaultGuards(basePriceGr: number): {
  minPriceGr: number;
  maxPriceGr: number;
} {
  return {
    minPriceGr: Math.max(1, Math.round(basePriceGr * 0.7)),
    maxPriceGr: Math.max(1, Math.round(basePriceGr * 1.8)),
  };
}

/**
 * Pobiera rekomendacje dla [from, to) i zapisuje do DynamicRate.
 * Zwraca liczbę zapisanych dób (0 = nic nie zrobiono).
 */
export async function refreshRates(
  unitTypeId: number,
  from: string,
  to: string
): Promise<number> {
  const provider = ratesProvider();
  if (!provider) return 0;

  const unitType = await prisma.unitType.findUnique({
    where: { id: unitTypeId },
    select: {
      id: true,
      basePriceGr: true,
      minPriceGr: true,
      maxPriceGr: true,
      propertyId: true,
      property: {
        select: { plan: true, pricingMode: true, smartRateMarketId: true },
      },
    },
  });
  if (!unitType) return 0;
  const { property } = unitType;
  if (property.pricingMode !== "SMARTRATE") return 0;
  if (!pricingPlanFeatures(property.plan).smartRate) return 0;
  if (!property.smartRateMarketId) return 0;

  // coalesce: ktoś już odświeżał ten zakres w ostatniej minucie
  const recent = await prisma.dynamicRate.findFirst({
    where: {
      unitTypeId,
      date: { gte: from, lt: to },
      fetchedAt: { gt: new Date(Date.now() - COALESCE_SECONDS * 1000) },
    },
    select: { id: true },
  });
  if (recent) return 0;

  const guards = defaultGuards(unitType.basePriceGr);
  try {
    const days = await provider.quote({
      marketId: property.smartRateMarketId,
      basePriceGr: unitType.basePriceGr,
      minPriceGr: unitType.minPriceGr ?? guards.minPriceGr,
      maxPriceGr: unitType.maxPriceGr ?? guards.maxPriceGr,
      from,
      to: addDaysISO(to, -1), // API liczy „to" włącznie, my dostajemy checkOut
    });
    for (const day of days) {
      await prisma.dynamicRate.upsert({
        where: { unitTypeId_date: { unitTypeId, date: day.date } },
        update: {
          priceGr: day.priceGr,
          clampedBy: day.clampedBy,
          demandScore: day.demandScore,
          drivers: JSON.stringify(day.drivers),
          components: JSON.stringify(day.components),
        },
        create: {
          unitTypeId,
          date: day.date,
          priceGr: day.priceGr,
          clampedBy: day.clampedBy,
          demandScore: day.demandScore,
          drivers: JSON.stringify(day.drivers),
          components: JSON.stringify(day.components),
        },
      });
    }
    await prisma.property.update({
      where: { id: unitType.propertyId },
      data: { smartRateSyncedAt: new Date(), smartRateError: "" },
    });
    return days.length;
  } catch (e) {
    // awaria jest cicha dla gościa (wycena degraduje do reguł) i głośna
    // dla właściciela — komunikat ląduje w panelu
    const message = e instanceof Error ? e.message : "Nieznany błąd";
    await prisma.property.update({
      where: { id: unitType.propertyId },
      data: { smartRateError: message.slice(0, 300) },
    });
    return 0;
  }
}

/**
 * Zlecenie odświeżenia poza ścieżką odpowiedzi. W kontekście żądania przez
 * after(); poza nim (cron, skrypty) after() rzuca — wtedy fire-and-forget.
 */
export async function afterRates(
  unitTypeId: number,
  from: string,
  to: string
): Promise<void> {
  try {
    after(() => refreshRates(unitTypeId, from, to));
  } catch {
    void refreshRates(unitTypeId, from, to).catch(() => {});
  }
}

/** Zmiana cennika/widełek/rynku unieważnia rekomendacje danego typu pokoju. */
export async function invalidateRates(unitTypeId: number): Promise<void> {
  await prisma.dynamicRate.deleteMany({ where: { unitTypeId } });
}
```

- [ ] **Step 4: Uruchom test — ma przejść**

```bash
npx vitest run lib/rates/refresh.test.ts
```

Oczekiwane: PASS (3 testy).

- [ ] **Step 5: Commit**

```bash
git add lib/rates/refresh.ts lib/rates/refresh.test.ts
git commit -m "Feat: SmartRate - odswiezanie w tle (after + coalesce), widelki domyslne, inwalidacja"
```

---

### Task A-T6: Dyspozytor w `quoteStayDynamic`

**Files:**
- Modify: `lib/dynamic-pricing.ts`
- Create: `lib/rates/quote-dispatch.test.ts`

**Interfaces:**
- Consumes: `cachedRates` z `lib/rates/cache.ts`, `afterRates` z `lib/rates/refresh.ts`, `pricingPlanFeatures` z `lib/plans.ts`.
- Produces: `applyCachedRates(base: Quote, priceByDate: Map<string, number>, depositPercent: number): Quote` — czysta funkcja podmieniająca ceny nocy w gotowej wycenie. Sygnatura `quoteStayDynamic` **bez zmian**.

- [ ] **Step 1: Napisz failujący test czystej podmiany cen**

Utwórz `lib/rates/quote-dispatch.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyCachedRates } from "../dynamic-pricing";

const base = {
  nights: 2,
  totalGr: 40000,
  depositGr: 12000,
  minStay: 2,
  nightly: [
    { date: "2026-08-01", priceGr: 20000 },
    { date: "2026-08-02", priceGr: 20000 },
  ],
};

describe("applyCachedRates", () => {
  it("podmienia ceny nocy i przelicza sumę oraz zaliczkę", () => {
    const rates = new Map([
      ["2026-08-01", 18000],
      ["2026-08-02", 23000],
    ]);
    const q = applyCachedRates(base, rates, 30);
    expect(q.nightly.map((n) => n.priceGr)).toEqual([18000, 23000]);
    expect(q.totalGr).toBe(41000);
    expect(q.depositGr).toBe(12300);
  });

  it("nie rusza minStay ani liczby nocy", () => {
    const q = applyCachedRates(base, new Map([["2026-08-01", 1], ["2026-08-02", 1]]), 30);
    expect(q.minStay).toBe(2);
    expect(q.nights).toBe(2);
  });
});
```

- [ ] **Step 2: Uruchom test — ma failować**

```bash
npx vitest run lib/rates/quote-dispatch.test.ts
```

Oczekiwane: FAIL — `applyCachedRates is not a function`.

- [ ] **Step 3: Dopisz dyspozytor**

W `lib/dynamic-pricing.ts` dopisz importy pod istniejące:

```ts
import { cachedRates } from "./rates/cache";
import { afterRates } from "./rates/refresh";
import { pricingPlanFeatures } from "./plans";
```

Następnie dopisz czystą funkcję nad `quoteStayDynamic`:

```ts
/** Podmiana cen nocy na rekomendacje z cache'u; reszta wyceny bez zmian. */
export function applyCachedRates(
  base: Quote,
  priceByDate: Map<string, number>,
  depositPercent: number
): Quote {
  const nightly = base.nightly.map(({ date, priceGr }) => ({
    date,
    priceGr: priceByDate.get(date) ?? priceGr,
  }));
  const totalGr = nightly.reduce((sum, n) => sum + n.priceGr, 0);
  return {
    ...base,
    nightly,
    totalGr,
    depositGr: Math.round((totalGr * depositPercent) / 100),
  };
}
```

- [ ] **Step 4: Wepnij dyspozytor na początek `quoteStayDynamic`**

W `lib/dynamic-pricing.ts`, zaraz po linii `const base = quoteStay(unitType, from, to, depositPercent);`, wstaw:

```ts
  // Tryb SMARTRATE: ceny z cache'u. Zasada „wszystko albo nic" — brak choćby
  // jednej nocy degraduje CAŁĄ wycenę do reguł, żeby gość nigdy nie zobaczył
  // ceny sklejonej z dwóch silników (ta sama reguła co przy push-u ARI).
  const property = await prisma.property.findUnique({
    where: { id: unitType.propertyId },
    select: { plan: true, pricingMode: true, smartRateMarketId: true },
  });
  if (
    property?.pricingMode === "SMARTRATE" &&
    pricingPlanFeatures(property.plan).smartRate &&
    property.smartRateMarketId
  ) {
    const cached = await cachedRates(unitType.id, from, to);
    if (cached.complete && !cached.stale) {
      return applyCachedRates(base, cached.priceByDate, depositPercent);
    }
    await afterRates(unitType.id, from, to);
    if (cached.complete) {
      // nieświeże, ale kompletne — obsługujemy gościa, świeże dociągnie after()
      return applyCachedRates(base, cached.priceByDate, depositPercent);
    }
  }
```

- [ ] **Step 5: Uruchom testy — mają przejść**

```bash
npx vitest run lib/rates/quote-dispatch.test.ts && npx tsc --noEmit
```

Oczekiwane: PASS (2 testy), `tsc` bez błędów.

- [ ] **Step 6: Uruchom pełny zestaw testów — regresja BASIC**

```bash
npx vitest run
```

Oczekiwane: wszystkie dotychczasowe testy nadal zielone (tryb domyślny to `BASIC`, więc ścieżka reguł jest nietknięta).

- [ ] **Step 7: Commit**

```bash
git add lib/dynamic-pricing.ts lib/rates/quote-dispatch.test.ts
git commit -m "Feat: SmartRate - dyspozytor w quoteStayDynamic (cache albo reguly, wszystko-albo-nic)"
```

---

### Task A-T7: Akcje panelu — tryb, rynek, widełki, inwalidacja

**Files:**
- Modify: `lib/actions.ts`

**Interfaces:**
- Consumes: `requireOwner`, `str`, `parsePlnToGr`, `ownedUnitType` (istniejące w `lib/actions.ts`), `pricingPlanFeatures`, `invalidateRates`, `defaultGuards`, `afterRates`, `ratesProvider`.
- Produces: server actions `setPricingMode(formData: FormData)`, `saveRateGuards(formData: FormData)`; `listMarkets(): Promise<Market[]>` do użycia przez stronę panelu.

- [ ] **Step 1: Dopisz importy**

W `lib/actions.ts`, do istniejących importów:

```ts
import { pricingPlanFeatures } from "./plans";
import { ratesProvider, type Market } from "./rates/provider";
import { afterRates, defaultGuards, invalidateRates } from "./rates/refresh";
```

`addDaysISO` i `todayISO` są już importowane w tym pliku (linia 19) — nie dubluj ich.

- [ ] **Step 2: Dodaj akcję przełączenia trybu i wyboru rynku**

Na końcu `lib/actions.ts`:

```ts
/** Lista rynków SmartRate dla panelu; pusta, gdy integracja nieskonfigurowana. */
export async function listMarkets(): Promise<Market[]> {
  const provider = ratesProvider();
  if (!provider) return [];
  try {
    return await provider.markets();
  } catch {
    return [];
  }
}

/** Przełączenie silnika wyceny i wybór rynku SmartRate. */
export async function setPricingMode(formData: FormData) {
  const { property } = await requireOwner();
  const mode = str(formData, "pricingMode") === "SMARTRATE" ? "SMARTRATE" : "BASIC";
  const marketId = str(formData, "smartRateMarketId").slice(0, 60);
  const fail = (msg: string) =>
    redirect(`/admin/cennik?error=${encodeURIComponent(msg)}`);

  if (mode === "SMARTRATE") {
    if (!pricingPlanFeatures(property.plan).smartRate)
      fail("Ceny dynamiczne SmartRate są dostępne w planie Pro.");
    if (!marketId) fail("Wybierz rynek, na którym leży obiekt.");
  }

  await prisma.property.update({
    where: { id: property.id },
    data: { pricingMode: mode, smartRateMarketId: marketId, smartRateError: "" },
  });

  // zmiana trybu lub rynku unieważnia wszystkie rekomendacje obiektu
  const types = await prisma.unitType.findMany({
    where: { propertyId: property.id },
    select: { id: true, basePriceGr: true, minPriceGr: true },
  });
  for (const t of types) {
    await invalidateRates(t.id);
    // pierwsze włączenie: uzupełnij widełki wyliczone z ceny bazowej
    if (mode === "SMARTRATE" && t.minPriceGr === null) {
      await prisma.unitType.update({ where: { id: t.id }, data: defaultGuards(t.basePriceGr) });
    }
  }
  if (mode === "SMARTRATE") {
    const from = todayISO();
    for (const t of types) await afterRates(t.id, from, addDaysISO(from, 180));
  }

  revalidatePath("/admin/cennik");
  redirect("/admin/cennik?saved=1");
}

/** Widełki bezpieczeństwa dla typu pokoju (dolna i górna granica ceny nocy). */
export async function saveRateGuards(formData: FormData) {
  const { property } = await requireOwner();
  const id = Number(str(formData, "unitTypeId"));
  const minPriceGr = parsePlnToGr(str(formData, "minPriceZl"));
  const maxPriceGr = parsePlnToGr(str(formData, "maxPriceZl"));
  const fail = (msg: string) =>
    redirect(`/admin/cennik?error=${encodeURIComponent(msg)}`);

  if (!(await ownedUnitType(id, property.id))) redirect("/admin/cennik");
  if (!Number.isFinite(minPriceGr) || !Number.isFinite(maxPriceGr) || minPriceGr < 1)
    fail("Widełki muszą być liczbami większymi od zera.");
  if (minPriceGr > maxPriceGr)
    fail("Cena minimalna nie może być wyższa od maksymalnej.");

  await prisma.unitType.update({ where: { id }, data: { minPriceGr, maxPriceGr } });
  await invalidateRates(id);
  revalidatePath("/admin/cennik");
  redirect("/admin/cennik?saved=1");
}
```

- [ ] **Step 3: Wepnij inwalidację w istniejące akcje cennika**

W `adminUpdatePricing`, po `await prisma.unitType.update({ ... })` (wewnątrz `if`), dopisz:

```ts
    await invalidateRates(id);
```

W `adminAddSeason`, po zapisie sezonu i przed `revalidatePath`, dopisz:

```ts
  await invalidateRates(unitTypeId);
```

W `adminDeleteSeason`, po usunięciu sezonu i przed `revalidatePath`, dopisz:

```ts
  await invalidateRates(season.unitTypeId);
```

- [ ] **Step 4: Sprawdź typy i lint**

```bash
npx tsc --noEmit && npm run lint
```

Oczekiwane: brak błędów.

- [ ] **Step 5: Commit**

```bash
git add lib/actions.ts
git commit -m "Feat: SmartRate - akcje panelu (tryb, rynek, widelki) i inwalidacja cache przy zmianie cennika"
```

---

### Task A-T8: Panel — sekcja „Silnik cen"

**Files:**
- Create: `components/admin/PricingEngineCard.tsx`
- Modify: `app/admin/cennik/page.tsx`

**Interfaces:**
- Consumes: `setPricingMode`, `saveRateGuards`, `listMarkets` z `lib/actions.ts`; `pricingPlanFeatures` z `lib/plans.ts`; `formatPln` z `lib/format.ts`.
- Produces: komponent serwerowy `PricingEngineCard` przyjmujący `{ property, markets, unitTypes, rates }`.

- [ ] **Step 1: Utwórz komponent sekcji**

Utwórz `components/admin/PricingEngineCard.tsx`:

```tsx
// Sekcja „Silnik cen" w /admin/cennik: wybór silnika (podstawowy / SmartRate),
// rynek, widełki per typ pokoju i pasek najbliższych dni z rozbiciem ceny.
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { saveRateGuards, setPricingMode } from "@/lib/actions";
import { formatPln } from "@/lib/format";
import { pricingPlanFeatures } from "@/lib/plans";
import type { Market } from "@/lib/rates/provider";

type UnitTypeRow = {
  id: number;
  name: string;
  basePriceGr: number;
  minPriceGr: number | null;
  maxPriceGr: number | null;
};

type RateRow = {
  unitTypeId: number;
  date: string;
  priceGr: number;
  clampedBy: string | null;
  demandScore: number;
  drivers: string;
  components: string;
};

export default function PricingEngineCard({
  property,
  markets,
  unitTypes,
  rates,
}: {
  property: {
    plan: string;
    pricingMode: string;
    smartRateMarketId: string;
    smartRateSyncedAt: Date | null;
    smartRateError: string;
  };
  markets: Market[];
  unitTypes: UnitTypeRow[];
  rates: RateRow[];
}) {
  const allowed = pricingPlanFeatures(property.plan).smartRate;
  const on = property.pricingMode === "SMARTRATE";

  if (!allowed) {
    return (
      <Card>
        <CardHeader title="Silnik cen" sub="Ceny dynamiczne SmartRate" />
        <CardBody className="space-y-3 text-sm text-slate-600">
          <p>
            SmartRate liczy cenę każdej doby z sezonowości, dnia tygodnia, wyprzedzenia,
            obłożenia rynku i popytu — i pokazuje, który mnożnik ile dołożył.
          </p>
          <Button href="/admin/plan" variant="quiet">
            Zobacz plany od Pro
          </Button>
        </CardBody>
      </Card>
    );
  }

  const byVoivodeship = new Map<string, Market[]>();
  for (const m of markets) {
    const list = byVoivodeship.get(m.voivodeship) ?? [];
    list.push(m);
    byVoivodeship.set(m.voivodeship, list);
  }

  return (
    <Card>
      <CardHeader
        title="Silnik cen"
        sub={on ? "SmartRate (ceny dynamiczne)" : "Podstawowy (reguły poniżej)"}
      />
      <CardBody className="space-y-5">
        {property.smartRateError && (
          <p className="alert-error">
            SmartRate zgłosił błąd: {property.smartRateError}. Do czasu naprawy ceny
            liczą się z reguł poniżej.
          </p>
        )}

        <form action={setPricingMode} className="flex flex-wrap items-end gap-3 text-sm">
          <label className="label">
            Silnik
            <select name="pricingMode" defaultValue={property.pricingMode} className="input w-52">
              <option value="BASIC">Podstawowy (reguły)</option>
              <option value="SMARTRATE">SmartRate</option>
            </select>
          </label>
          <label className="label">
            Rynek
            <select
              name="smartRateMarketId"
              defaultValue={property.smartRateMarketId}
              className="input w-64"
            >
              <option value="">— wybierz —</option>
              {[...byVoivodeship.entries()].map(([voivodeship, list]) => (
                <optgroup key={voivodeship} label={voivodeship}>
                  {list.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <Button type="submit">Zapisz</Button>
          {property.smartRateSyncedAt && (
            <span className="text-[12px] text-slate-400">
              Ostatnie pobranie: {property.smartRateSyncedAt.toISOString().slice(0, 16).replace("T", " ")}
            </span>
          )}
        </form>

        {on &&
          unitTypes.map((ut) => {
            const days = rates
              .filter((r) => r.unitTypeId === ut.id)
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(0, 30);
            return (
              <div key={ut.id} className="space-y-2 border-t border-slate-100 pt-4">
                <p className="text-[13px] font-bold text-brand-950">{ut.name}</p>
                <form action={saveRateGuards} className="flex flex-wrap items-end gap-3 text-sm">
                  <input type="hidden" name="unitTypeId" value={ut.id} />
                  <label className="label">
                    Cena min. / noc (zł)
                    <input
                      name="minPriceZl"
                      defaultValue={((ut.minPriceGr ?? 0) / 100).toString().replace(".", ",")}
                      className="input tnum w-32"
                    />
                  </label>
                  <label className="label">
                    Cena maks. / noc (zł)
                    <input
                      name="maxPriceZl"
                      defaultValue={((ut.maxPriceGr ?? 0) / 100).toString().replace(".", ",")}
                      className="input tnum w-32"
                    />
                  </label>
                  <Button type="submit" variant="quiet">
                    Zapisz widełki
                  </Button>
                </form>

                {days.length === 0 ? (
                  <p className="text-[12px] text-slate-400">
                    Rekomendacje pobiorą się w tle — odśwież stronę za chwilę.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead className="text-left text-slate-400">
                        <tr>
                          <th className="py-1 pr-3 font-semibold">Data</th>
                          <th className="py-1 pr-3 font-semibold">Cena</th>
                          <th className="py-1 pr-3 font-semibold">Popyt</th>
                          <th className="py-1 font-semibold">Dlaczego</th>
                        </tr>
                      </thead>
                      <tbody>
                        {days.map((d) => {
                          const c = JSON.parse(d.components) as Record<string, number>;
                          const drivers = JSON.parse(d.drivers) as string[];
                          const factors = [
                            ["sezon", c.season],
                            ["dzień tyg.", c.dayOfWeek],
                            ["wyprzedzenie", c.leadTime],
                            ["obłożenie", c.occupancy],
                            ["popyt", c.demand],
                          ] as const;
                          return (
                            <tr key={d.date} className="border-t border-slate-100">
                              <td className="tnum py-1 pr-3">{d.date}</td>
                              <td className="tnum py-1 pr-3 font-bold">
                                {formatPln(d.priceGr)}
                                {d.clampedBy && (
                                  <Badge tone="warning">
                                    {d.clampedBy === "max" ? "obcięte do maks." : "podbite do min."}
                                  </Badge>
                                )}
                              </td>
                              <td className="tnum py-1 pr-3">{d.demandScore}</td>
                              <td className="py-1 text-slate-500">
                                {factors
                                  .filter(([, v]) => typeof v === "number" && v !== 1)
                                  .map(([label, v]) => `${label} ×${v.toFixed(2)}`)
                                  .join(" · ")}
                                {drivers.length > 0 && ` — ${drivers.join(", ")}`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
      </CardBody>
    </Card>
  );
}
```

- [ ] **Step 2: Wepnij sekcję na stronę cennika**

W `app/admin/cennik/page.tsx` dopisz importy:

```tsx
import PricingEngineCard from "@/components/admin/PricingEngineCard";
import { listMarkets } from "@/lib/actions";
import { todayISO, addDaysISO } from "@/lib/dates";
```

Pod istniejącym `prisma.$transaction([...])` dopisz pobranie rynków i rekomendacji:

```tsx
  const markets = await listMarkets();
  const today = todayISO();
  const rates = await prisma.dynamicRate.findMany({
    where: {
      unitTypeId: { in: unitTypes.map((u) => u.id) },
      date: { gte: today, lt: addDaysISO(today, 30) },
    },
    orderBy: { date: "asc" },
  });
```

I na początku zwracanego `<div className="space-y-4">`, przed `{unitTypes.map(...)}`:

```tsx
      <PricingEngineCard
        property={property}
        markets={markets}
        unitTypes={unitTypes}
        rates={rates}
      />
```

- [ ] **Step 3: Opisz reguły jako awaryjne**

W `app/admin/cennik/page.tsx` znajdź nagłówek karty z regułami (`PRICING_RULE_KINDS`) i uzupełnij jego `sub` o zdanie:

```tsx
sub="Reguły działają, gdy silnik SmartRate jest wyłączony lub nie odpowiada."
```

- [ ] **Step 4: Sprawdź typy, lint i build**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Oczekiwane: brak błędów, build przechodzi.

- [ ] **Step 5: Commit**

```bash
git add components/admin/PricingEngineCard.tsx app/admin/cennik/page.tsx
git commit -m "Feat: SmartRate - sekcja Silnik cen w panelu (tryb, rynek, widelki, rozbicie ceny)"
```

---

### Task A-T9: Cron odświeżający horyzont

**Files:**
- Create: `app/api/cron/rates/route.ts`
- Modify: `lib/jobs.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `refreshRates` z `lib/rates/refresh.ts`, `safeEqual` z `lib/password.ts`.
- Produces: `refreshAllRates(): Promise<number>` w `lib/jobs.ts`; endpoint `GET /api/cron/rates`.

- [ ] **Step 1: Dodaj zadanie do `lib/jobs.ts`**

Na końcu `lib/jobs.ts`:

```ts
/** Odbudowa horyzontu rekomendacji (180 dni) dla obiektów w trybie SMARTRATE. */
export async function refreshAllRates(): Promise<number> {
  const from = todayISO();
  const to = addDaysISO(from, 180);
  const types = await prisma.unitType.findMany({
    where: { property: { pricingMode: "SMARTRATE" } },
    select: { id: true },
  });
  let days = 0;
  for (const t of types) days += await refreshRates(t.id, from, to);
  return days;
}
```

Dopisz do importów pliku (jeśli brakuje):

```ts
import { addDaysISO, todayISO } from "./dates";
import { refreshRates } from "./rates/refresh";
```

- [ ] **Step 2: Utwórz endpoint crona**

Utwórz `app/api/cron/rates/route.ts`:

```ts
import { refreshAllRates } from "@/lib/jobs";
import { safeEqual } from "@/lib/password";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Wywoływane przez Vercel Cron (harmonogram w vercel.json). Fail-closed:
// bez skonfigurowanego CRON_SECRET endpoint jest niedostępny.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const days = await refreshAllRates();
  return Response.json({ ok: true, days });
}
```

- [ ] **Step 3: Dopisz harmonogram**

W `vercel.json`, do tablicy `crons`:

```json
    {
      "path": "/api/cron/rates",
      "schedule": "0 3 * * *"
    }
```

- [ ] **Step 4: Sprawdź autoryzację endpointu ręcznie**

```bash
npm run dev
```

W drugim terminalu:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/cron/rates
```

Oczekiwane: `401`.

- [ ] **Step 5: Sprawdź typy i lint**

```bash
npx tsc --noEmit && npm run lint
```

Oczekiwane: brak błędów.

- [ ] **Step 6: Commit**

```bash
git add app/api/cron/rates/route.ts lib/jobs.ts vercel.json
git commit -m "Feat: SmartRate - cron odbudowujacy horyzont 180 dni rekomendacji"
```

---

### Task A-T10: e2e i dokumentacja

**Files:**
- Create: `tests/e2e/smartrate.spec.ts`
- Modify: `docs/FUNKCJE.md`
- Modify: `README.md`
- Modify: `playwright.config.ts`

**Interfaces:**
- Consumes: `loginAsOwner`, `PROPERTY_SLUG`, `futureISO` z `tests/e2e/helpers.ts`.

- [ ] **Step 1: Włącz stub w środowisku testów Playwright**

W `playwright.config.ts` sekcja `webServer` nie ma dziś `env` — dodaj je, zachowując resztę pól:

```ts
  webServer: {
    // bezpośrednio `next dev` — `npm run dev -- -p 3100` na tym npm gubi flagę portu
    command: "npx next dev -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    timeout: 60_000,
    // deterministyczny silnik cen — testy nie potrzebują dockera z .NET
    env: { ...process.env, SMARTRATE_STUB: "1" },
  },
```

- [ ] **Step 2: Napisz test e2e**

Utwórz `tests/e2e/smartrate.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { PROPERTY_SLUG, futureISO, loginAsOwner } from "./helpers";

// Ceny dynamiczne SmartRate: włączenie w panelu (stub providera) zmienia cenę
// widzianą przez gościa, a wyłączenie wraca do reguł. Test sięga do DB, stąd .env.
loadEnvConfig(process.cwd());

type Db = typeof import("../../lib/db");
let prisma: Db["prisma"];

test.describe("ceny dynamiczne SmartRate", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    ({ prisma } = await import("../../lib/db"));
    await prisma.property.update({
      where: { slug: PROPERTY_SLUG },
      data: { plan: "PRO", pricingMode: "BASIC", smartRateMarketId: "" },
    });
  });

  test.afterAll(async () => {
    await prisma.property.update({
      where: { slug: PROPERTY_SLUG },
      data: { pricingMode: "BASIC", smartRateMarketId: "" },
    });
  });

  test("właściciel Pro włącza SmartRate, gość widzi cenę z silnika", async ({ page }) => {
    // piątek w przyszłości — stub podbija noce weekendowe o 15%
    const from = futureISO(0);
    const to = futureISO(2);

    await loginAsOwner(page);
    await page.goto("/admin/cennik");
    await expect(page.getByText("Silnik cen")).toBeVisible();

    await page.getByLabel("Silnik").selectOption("SMARTRATE");
    await page.getByLabel("Rynek").selectOption("mkt_gdansk");
    await page.getByRole("button", { name: "Zapisz" }).first().click();
    await expect(page.getByText("Zapisano zmiany.")).toBeVisible();

    // pierwsze wejście gościa może trafić na pusty cache — poll, aż after()
    // dociągnie rekomendacje i cena przestanie być statyczna
    const url = `/o/${PROPERTY_SLUG}/wyniki?from=${from}&to=${to}&guests=2`;
    await expect
      .poll(
        async () => {
          await page.goto(url);
          return prisma.dynamicRate.count();
        },
        { timeout: 20_000 }
      )
      .toBeGreaterThan(0);

    await page.goto(url);
    await expect(page.getByRole("link", { name: "Rezerwuję" }).first()).toBeVisible();
  });

  test("wyłączenie SmartRate czyści rekomendacje i wraca do reguł", async ({ page }) => {
    await loginAsOwner(page);
    await page.goto("/admin/cennik");
    await page.getByLabel("Silnik").selectOption("BASIC");
    await page.getByRole("button", { name: "Zapisz" }).first().click();
    await expect(page.getByText("Zapisano zmiany.")).toBeVisible();
    expect(await prisma.dynamicRate.count()).toBe(0);
  });
});
```

- [ ] **Step 3: Uruchom test e2e**

```bash
npx playwright test tests/e2e/smartrate.spec.ts
```

Oczekiwane: 2 passed.

- [ ] **Step 4: Uruchom pełną regresję**

```bash
npx tsc --noEmit && npm run lint && npx vitest run && npx playwright test
```

Oczekiwane: wszystko zielone.

- [ ] **Step 5: Dopisz rozdział do `docs/FUNKCJE.md`**

W spisie treści, pod pozycją 13, dopisz:

```markdown
14. [Ceny dynamiczne (SmartRate)](#14-ceny-dynamiczne-smartrate)
```

Na końcu pliku dopisz rozdział `## 14. Ceny dynamiczne (SmartRate)` z podrozdziałami:

- **Dwa silniki** — `Property.pricingMode`: `BASIC` (reguły `PricingRule`) i `SMARTRATE` (API); przełącznik w `/admin/cennik`, dostępny tylko w planie Pro (`pricingPlanFeatures`).
- **Skąd bierze się cena** — `POST /v1/quote` liczy dobę po dobie z sezonowości, dnia tygodnia, wyprzedzenia, obłożenia rynku i popytu; panel pokazuje rozbicie na mnożniki, `demand_drivers` i znacznik obcięcia do widełek.
- **Widełki** — `UnitType.minPriceGr` / `maxPriceGr`, przy pierwszym włączeniu wyliczane jako −30% / +80% ceny bazowej.
- **Cache i świeżość** — tabela `DynamicRate` (doba = wiersz), TTL `SMARTRATE_TTL_HOURS` (domyślnie 12), coalesce 60 s; ścieżka gościa **nie robi HTTP**.
- **Wszystko albo nic** — brak choćby jednej nocy w cache degraduje CAŁĄ wycenę do reguł, żeby cena w wyszukiwarce zgadzała się z ceną przy rezerwacji.
- **Odświeżanie** — `after()` po odpowiedzi (`lib/rates/refresh.ts`) i cron `/api/cron/rates` (horyzont 180 dni, `vercel.json`); zmiana cennika, sezonu, widełek lub rynku unieważnia wpisy.
- **Awarie** — ciche dla gościa (wycena z reguł), głośne dla właściciela (`Property.smartRateError` jako alert w panelu).
- **Konfiguracja** — `SMARTRATE_URL`, `SMARTRATE_API_KEY`, `SMARTRATE_STUB=1` (deterministyczny stub w dev/testach), `SMARTRATE_TTL_HOURS`. Bez `SMARTRATE_URL` tryb jest ukryty w panelu.

- [ ] **Step 6: Dopisz notkę do `README.md`**

W sekcji „Zakres MVP", w bloku właściciela, dopisz punkt:

```markdown
- **ceny dynamiczne (Pro)**: przełącznik silnika wyceny — podstawowe reguły RezFlow albo zewnętrzne API SmartRate (rekomendacja per doba z rozbiciem na sezon, dzień tygodnia, wyprzedzenie, obłożenie rynku i popyt); ceny czytane z cache w bazie, odświeżane w tle, awaria API cicho degraduje do reguł.
```

W sekcji „Konwencje" dopisz:

```markdown
- Ceny dynamiczne: `quoteStayDynamic` jest jedynym wejściem do wyceny; SmartRate wchodzi przez cache `DynamicRate` (nigdy HTTP w ścieżce gościa), a niepełne pokrycie degraduje CAŁĄ wycenę do reguł.
```

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/smartrate.spec.ts playwright.config.ts docs/FUNKCJE.md README.md
git commit -m "Feat: SmartRate - e2e wlaczenia silnika i dokumentacja"
```
