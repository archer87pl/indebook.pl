# Channex — Plan A: Fundament (niezależny od Channex) — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zbudować fundament synchronizacji kanałów: model danych, liczenie dostępności per Room Type, kolejkę outbox z workerem (na stubie providera), przełącznik trybu `OFF/ICAL/CHANNEX` z gatingiem PRO i panel „Log synchronizacji" — wszystko testowalne bez konta Channex.

**Architecture:** RezOp źródłem prawdy dostępności. Zmiana dostępności → zapis zadania do `AriOutbox` → worker liczy dostępność per doba i woła `ChannelProvider.pushAri` (w Planie A: stub). `ChannelProvider` za abstrakcją (jak `DomainProvider`), `channelProvider()` = `null` gdy brak konfiguracji. Wszystkie plany B/C/D wpinają się w interfejsy zdefiniowane tutaj.

**Tech Stack:** Next.js 16 (App Router, server actions, `after()`), Prisma + Postgres (Supabase), vitest, Tailwind 4.

## Global Constraints

- Next.js 16: `params`/`searchParams` są `Promise` (await); server actions wzorcem `requireOwner()` → walidacja → `redirect(?error=)` | `revalidatePath` + `redirect(?saved=1)`; wynik akcji pokazuje globalny `Toaster` (nie inline-alerty).
- Daty jako `YYYY-MM-DD` (string), zakresy `[from, to)` (checkOut/endDate exclusive) — spójnie z `Reservation`/`Block`. Helpery z `lib/dates` (`todayISO`, `addDaysISO`, `eachNight`, `monthDays`).
- Dostępność liczona jak w `lib/availability` (`conflictingReservationWhere` — CONFIRMED lub PENDING z `expiresAt > now`; bloki nachodzące na zakres).
- Kwoty w groszach (Int). Gating: Channex = plan `PRO`; iCal = `STANDARD+`.
- Brak konfiguracji Channex (`channelProvider() === null`) = segment „Channex" ukryty/wyszarzony (wzorzec jak P24/Vercel).
- Prisma: po zmianie schematu `npx prisma db push --skip-generate` potem `npx prisma generate` (na Windows generate bywa blokowany — jeśli EPERM, powtórz po zatrzymaniu dev-serwera). DB współdzielona z dev — nie odpalać `next build` przy działającym `next dev` (psuje `.next`).
- Testy: vitest (`lib/**/*.test.ts`, polskie opisy), czysta logika bez mocków bazy tam gdzie się da; worker testowany z wstrzykniętym stubem providera.
- Commity małe, po polsku, konwencja repo (`Feat:`/`Fix:`).

---

### Task 1: Model danych — schemat

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces (Produces):**
- `Property.syncMode: String @default("ICAL")` — `OFF | ICAL | CHANNEX`.
- Model `ChannexProperty { id, propertyId (unique), channexId String @default(""), apiKey String @default(""), status String @default("NONE"), lastError String @default(""), syncedAt DateTime? }` + relacja `Property.channex ChannexProperty?`.
- Model `ChannexRoom { id, unitTypeId (unique), channexRoomTypeId String @default(""), channexRatePlanId String @default("") }` + relacja `UnitType.channexRoom ChannexRoom?`.
- Model `AriOutbox { id, propertyId Int, unitTypeId Int, dateFrom String, dateTo String, status String @default("PENDING"), attempts Int @default(0), lastError String @default(""), createdAt DateTime @default(now()), updatedAt DateTime @updatedAt, @@index([status]), @@index([propertyId]) }`.
- `Reservation.channexBookingId String? @unique`, `Reservation.otaCommissionGr Int @default(0)`. (`source` zostaje `String`; nowe wartości `BOOKING/AIRBNB/EXPEDIA/CHANNEX_OTHER` używane przez kod, bez zmiany typu.)

- [ ] **Step 1: Dodać pola i modele do schematu**

W `model Property` po `p24Sandbox`:
```prisma
  // tryb synchronizacji kanałów: OFF | ICAL | CHANNEX (patrz lib/channex)
  syncMode       String     @default("ICAL")
```
i w liście relacji `Property`:
```prisma
  channex        ChannexProperty?
```
W `model UnitType` w relacjach:
```prisma
  channexRoom ChannexRoom?
```
W `model Reservation` po `paymentOrderId`:
```prisma
  // integracja Channex: id rezerwacji w Channex (idempotencja webhooka) + prowizja OTA
  channexBookingId String? @unique
  otaCommissionGr  Int     @default(0)
```
Na końcu pliku:
```prisma
// Integracja Channex — odwzorowanie obiektu na Property w Channex.
// status: NONE | PENDING | ACTIVE | PAUSED | ERROR
model ChannexProperty {
  id         Int       @id @default(autoincrement())
  propertyId Int       @unique
  property   Property  @relation(fields: [propertyId], references: [id])
  channexId  String    @default("")
  apiKey     String    @default("")
  status     String    @default("NONE")
  lastError  String    @default("")
  syncedAt   DateTime?
}

// Odwzorowanie typu pokoju na Room Type + Rate Plan w Channex.
model ChannexRoom {
  id                Int      @id @default(autoincrement())
  unitTypeId        Int      @unique
  unitType          UnitType @relation(fields: [unitTypeId], references: [id])
  channexRoomTypeId String   @default("")
  channexRatePlanId String   @default("")
}

// Kolejka zmian dostępności do wypchnięcia do Channex (wzorzec outbox).
// status: PENDING | SENT | ERROR
model AriOutbox {
  id         Int      @id @default(autoincrement())
  propertyId Int
  unitTypeId Int
  dateFrom   String
  dateTo     String
  status     String   @default("PENDING")
  attempts   Int      @default(0)
  lastError  String   @default("")
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([status])
  @@index([propertyId])
}
```

- [ ] **Step 2: Push schematu i generacja klienta**

Run: `npx prisma db push --skip-generate` → oczekiwane „in sync"; potem `npx prisma generate`.
Weryfikacja: `npx tsx -e "import {prisma} from './lib/db'; prisma.ariOutbox.count().then(c=>{console.log('ariOutbox',c);process.exit(0)})"` → wypisze `ariOutbox 0`.

- [ ] **Step 3: Commit**
```bash
git add prisma/schema.prisma
git commit -m "Feat: Channex - model danych (syncMode, ChannexProperty/Room, AriOutbox)"
```

---

### Task 2: Interfejs `ChannelProvider` + stub + gating planu

**Files:**
- Create: `lib/channex/provider.ts`, `lib/channex/provider.test.ts`
- Modify: `lib/plans.ts`, `lib/plans.test.ts`

**Interfaces (Produces):**
```ts
// lib/channex/provider.ts
export type AriDay = { date: string; availability: number; minStay: number };
export type ProvisionInput = {
  name: string; address: string; currency: string; timezone: string;
  checkInFrom: string; checkOutTo: string;
  rooms: { unitTypeId: number; title: string; occupancy: number; count: number }[];
};
export type ProvisionResult = {
  channexPropertyId: string; apiKey: string;
  rooms: { unitTypeId: number; roomTypeId: string; ratePlanId: string }[];
};
export type BookingData = {
  channexBookingId: string; channexPropertyId: string; channexRoomTypeId: string;
  channel: string; status: "new" | "modified" | "cancelled"; revision: number;
  arrival: string; departure: string; guests: number;
  guestName: string; email: string; phone: string;
  totalGr: number; commissionGr: number;
};
export interface ChannelProvider {
  provisionProperty(input: ProvisionInput): Promise<ProvisionResult>;
  pushAri(apiKey: string, roomTypeId: string, ratePlanId: string, days: AriDay[]): Promise<void>;
  getBooking(apiKey: string, bookingId: string): Promise<BookingData | null>;
}
export function channelProvider(): ChannelProvider | null; // null gdy brak CHANNEX_API_KEY
export const stubProvider: ChannelProvider; // do dev/testów; pushAri = no-op, zapisuje wywołania do stubProvider.calls
```
- `lib/plans.ts`: `channelSyncFeatures(plan: string): { ical: boolean; channex: boolean }` (ical: STANDARD|PRO; channex: PRO).

- [ ] **Step 1: Test gatingu i stubu**

`lib/plans.test.ts` (dopisać):
```ts
import { channelSyncFeatures } from "./plans";
describe("channelSyncFeatures", () => {
  it("FREE bez kanałów", () => expect(channelSyncFeatures("FREE")).toEqual({ ical: false, channex: false }));
  it("STANDARD: iCal, bez Channex", () => expect(channelSyncFeatures("STANDARD")).toEqual({ ical: true, channex: false }));
  it("PRO: iCal i Channex", () => expect(channelSyncFeatures("PRO")).toEqual({ ical: true, channex: true }));
});
```
`lib/channex/provider.test.ts`:
```ts
import { describe, expect, it, beforeEach } from "vitest";
import { stubProvider } from "./provider";
describe("stubProvider", () => {
  beforeEach(() => { stubProvider.calls.length = 0; });
  it("pushAri zapisuje wywołanie i nie rzuca", async () => {
    await stubProvider.pushAri("k", "rt", "rp", [{ date: "2026-08-01", availability: 2, minStay: 1 }]);
    expect(stubProvider.calls).toHaveLength(1);
    expect(stubProvider.calls[0]).toMatchObject({ roomTypeId: "rt", days: [{ date: "2026-08-01", availability: 2 }] });
  });
});
```

- [ ] **Step 2: Uruchomić — FAIL** (`npx vitest run lib/plans.test.ts lib/channex/provider.test.ts`) — brak `channelSyncFeatures`/`stubProvider`.

- [ ] **Step 3: Implementacja**

`lib/plans.ts` — dopisać:
```ts
// Synchronizacja kanałów: iCal od Standard, Channex (2-way) tylko w Pro.
export function channelSyncFeatures(plan: string): { ical: boolean; channex: boolean } {
  return { ical: plan === "STANDARD" || plan === "PRO", channex: plan === "PRO" };
}
```
`lib/channex/provider.ts`:
```ts
// Abstrakcja channel managera (jak DomainProvider). Implementacja Channex
// dochodzi w Planie B; tu tylko interfejs + stub do dev/testów.

export type AriDay = { date: string; availability: number; minStay: number };
export type ProvisionInput = {
  name: string; address: string; currency: string; timezone: string;
  checkInFrom: string; checkOutTo: string;
  rooms: { unitTypeId: number; title: string; occupancy: number; count: number }[];
};
export type ProvisionResult = {
  channexPropertyId: string; apiKey: string;
  rooms: { unitTypeId: number; roomTypeId: string; ratePlanId: string }[];
};
export type BookingData = {
  channexBookingId: string; channexPropertyId: string; channexRoomTypeId: string;
  channel: string; status: "new" | "modified" | "cancelled"; revision: number;
  arrival: string; departure: string; guests: number;
  guestName: string; email: string; phone: string;
  totalGr: number; commissionGr: number;
};
export interface ChannelProvider {
  provisionProperty(input: ProvisionInput): Promise<ProvisionResult>;
  pushAri(apiKey: string, roomTypeId: string, ratePlanId: string, days: AriDay[]): Promise<void>;
  getBooking(apiKey: string, bookingId: string): Promise<BookingData | null>;
}

type StubCall = { apiKey: string; roomTypeId: string; ratePlanId: string; days: AriDay[] };
export const stubProvider: ChannelProvider & { calls: StubCall[] } = {
  calls: [],
  async provisionProperty(input) {
    return {
      channexPropertyId: "stub-prop",
      apiKey: "stub-key",
      rooms: input.rooms.map((r) => ({
        unitTypeId: r.unitTypeId,
        roomTypeId: `stub-rt-${r.unitTypeId}`,
        ratePlanId: `stub-rp-${r.unitTypeId}`,
      })),
    };
  },
  async pushAri(apiKey, roomTypeId, ratePlanId, days) {
    this.calls.push({ apiKey, roomTypeId, ratePlanId, days });
  },
  async getBooking() {
    return null;
  },
};

// Realny provider dochodzi w Planie B. Bez konfiguracji zwracamy null →
// tryb Channex ukryty w panelu. W dev można wymusić stub przez CHANNEX_STUB=1.
export function channelProvider(): ChannelProvider | null {
  if (process.env.CHANNEX_STUB === "1") return stubProvider;
  return null; // Plan B podłączy Channex, gdy jest CHANNEX_API_KEY
}
```

- [ ] **Step 4: Uruchomić — PASS.**
- [ ] **Step 5: Commit**
```bash
git add lib/channex/provider.ts lib/channex/provider.test.ts lib/plans.ts lib/plans.test.ts
git commit -m "Feat: Channex - interfejs ChannelProvider, stub i gating planu"
```

---

### Task 3: Dostępność per Room Type (liczba wolnych Unitów per doba)

**Files:**
- Create: `lib/channex/availability.ts`, `lib/channex/availability.test.ts`

**Interfaces:**
- Consumes: `conflictingReservationWhere` z `lib/availability`, `monthDays`/`eachNight`/`addDaysISO` z `lib/dates`.
- Produces: `roomTypeAvailability(unitTypeId: number, from: string, to: string): Promise<{ date: string; free: number }[]>` — dla każdej doby `[from, to)` liczba wolnych aktywnych Unitów typu (0 gdy wszystkie zajęte/zablokowane).

- [ ] **Step 1: Test** (`lib/channex/availability.test.ts`) — z realną bazą przez seed nie robimy; zamiast tego testujemy czystą funkcję liczącą z danych w pamięci. Dlatego wydzielamy pure-core:
```ts
import { describe, expect, it } from "vitest";
import { countFreePerDay } from "./availability";

describe("countFreePerDay", () => {
  const days = ["2026-08-01", "2026-08-02", "2026-08-03"];
  it("bez zajętości = pełna liczba jednostek", () => {
    expect(countFreePerDay(days, 2, [], [])).toEqual([
      { date: "2026-08-01", free: 2 }, { date: "2026-08-02", free: 2 }, { date: "2026-08-03", free: 2 },
    ]);
  });
  it("rezerwacja [08-01,08-03) zajmuje 1 jednostkę w tych dobach", () => {
    const res = [{ checkIn: "2026-08-01", checkOut: "2026-08-03" }];
    expect(countFreePerDay(days, 2, res, [])).toEqual([
      { date: "2026-08-01", free: 1 }, { date: "2026-08-02", free: 1 }, { date: "2026-08-03", free: 2 },
    ]);
  });
  it("blok nakłada się z rezerwacją — nie schodzi poniżej 0", () => {
    const res = [{ checkIn: "2026-08-01", checkOut: "2026-08-02" }];
    const blocks = [{ startDate: "2026-08-01", endDate: "2026-08-02" }];
    expect(countFreePerDay(days, 1, res, blocks)).toEqual([
      { date: "2026-08-01", free: 0 }, { date: "2026-08-02", free: 1 }, { date: "2026-08-03", free: 1 },
    ]);
  });
});
```
(Uwaga: „zajęte" liczymy jako liczbę nachodzących rezerwacji+bloków, ale nie więcej niż liczba jednostek — `free = max(0, units - busy)`.)

- [ ] **Step 2: FAIL** (`npx vitest run lib/channex/availability.test.ts`).

- [ ] **Step 3: Implementacja**
```ts
import type { Prisma } from "@prisma/client";
import { conflictingReservationWhere } from "../availability";
import { addDaysISO } from "../dates";
import { prisma } from "../db";

type Span = { checkIn?: string; checkOut?: string; startDate?: string; endDate?: string };

/** Czysta: dla każdej doby liczba wolnych = jednostki − nachodzące (rezerwacje+bloki), min 0. */
export function countFreePerDay(
  days: string[],
  unitCount: number,
  reservations: { checkIn: string; checkOut: string }[],
  blocks: { startDate: string; endDate: string }[]
): { date: string; free: number }[] {
  return days.map((date) => {
    const next = addDaysISO(date, 1);
    const busyRes = reservations.filter((r) => r.checkIn < next && r.checkOut > date).length;
    const busyBlk = blocks.filter((b) => b.startDate < next && b.endDate > date).length;
    return { date, free: Math.max(0, unitCount - busyRes - busyBlk) };
  });
}

/** Dostępność typu pokoju per doba w [from, to) z danych w bazie. */
export async function roomTypeAvailability(
  unitTypeId: number,
  from: string,
  to: string
): Promise<{ date: string; free: number }[]> {
  const units = await prisma.unit.findMany({
    where: { unitTypeId, active: true },
    select: {
      reservations: {
        where: conflictingReservationWhere(from, to) as Prisma.ReservationWhereInput,
        select: { checkIn: true, checkOut: true },
      },
      blocks: {
        where: { source: "MANUAL", startDate: { lt: to }, endDate: { gt: from } },
        select: { startDate: true, endDate: true },
      },
    },
  });
  const unitCount = units.length;
  const reservations = units.flatMap((u) => u.reservations);
  const blocks = units.flatMap((u) => u.blocks);
  const days: string[] = [];
  for (let d = from; d < to; d = addDaysISO(d, 1)) days.push(d);
  return countFreePerDay(days, unitCount, reservations, blocks);
}
```
(W trybie CHANNEX bloki iCal nie istnieją — liczymy tylko `MANUAL`; rezerwacje z OTA są normalnymi rezerwacjami, więc wpadają do `conflictingReservationWhere`.)

- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** `Feat: Channex - dostepnosc per Room Type (liczba wolnych jednostek)`.

---

### Task 4: Restrykcje + builder payloadu ARI

**Files:**
- Create: `lib/channex/ari.ts`, `lib/channex/ari.test.ts`

**Interfaces:**
- Consumes: `roomTypeAvailability` (Task 3), `AriDay` (Task 2).
- Produces: `minStayForDay(date, unitTypeMinStay, seasons): number`; `buildAriDays(avail, unitTypeMinStay, seasons): AriDay[]`.

- [ ] **Step 1: Test** (`lib/channex/ari.test.ts`):
```ts
import { describe, expect, it } from "vitest";
import { buildAriDays, minStayForDay } from "./ari";

const seasons = [{ startDate: "2026-08-01", endDate: "2026-08-31", minStay: 3 }];
describe("minStayForDay", () => {
  it("sezon nadpisuje minStay typu", () => expect(minStayForDay("2026-08-10", 1, seasons)).toBe(3));
  it("poza sezonem — minStay typu", () => expect(minStayForDay("2026-09-10", 2, seasons)).toBe(2));
});
describe("buildAriDays", () => {
  it("łączy dostępność z minStay", () => {
    const avail = [{ date: "2026-08-01", free: 2 }, { date: "2026-09-01", free: 1 }];
    expect(buildAriDays(avail, 1, seasons)).toEqual([
      { date: "2026-08-01", availability: 2, minStay: 3 },
      { date: "2026-09-01", availability: 1, minStay: 1 },
    ]);
  });
});
```

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implementacja**
```ts
import type { AriDay } from "./provider";

type SeasonLike = { startDate: string; endDate: string; minStay: number };

/** minStay dla doby: sezon obejmujący datę (inclusive) nadpisuje minStay typu. */
export function minStayForDay(date: string, unitTypeMinStay: number, seasons: SeasonLike[]): number {
  const s = seasons.find((x) => x.startDate <= date && date <= x.endDate);
  return s ? s.minStay : unitTypeMinStay;
}

export function buildAriDays(
  availability: { date: string; free: number }[],
  unitTypeMinStay: number,
  seasons: SeasonLike[]
): AriDay[] {
  return availability.map((a) => ({
    date: a.date,
    availability: a.free,
    minStay: minStayForDay(a.date, unitTypeMinStay, seasons),
  }));
}
```

- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** `Feat: Channex - builder payloadu ARI (dostepnosc + minStay)`.

---

### Task 5: Outbox — enqueue + sklejanie zakresów

**Files:**
- Create: `lib/channex/outbox.ts`, `lib/channex/outbox.test.ts`

**Interfaces:**
- Produces:
  - `enqueueAri(propertyId: number, unitTypeId: number, from: string, to: string): Promise<void>` — dopisuje wiersz `AriOutbox` (PENDING).
  - `coalesceRanges(rows: { unitTypeId: number; dateFrom: string; dateTo: string }[]): { unitTypeId: number; dateFrom: string; dateTo: string }[]` — czysta; scala nachodzące/stykające się zakresy per unitType do min–max.

- [ ] **Step 1: Test** (czysta funkcja sklejania):
```ts
import { describe, expect, it } from "vitest";
import { coalesceRanges } from "./outbox";

describe("coalesceRanges", () => {
  it("scala nachodzące zakresy tego samego typu", () => {
    expect(coalesceRanges([
      { unitTypeId: 1, dateFrom: "2026-08-01", dateTo: "2026-08-05" },
      { unitTypeId: 1, dateFrom: "2026-08-04", dateTo: "2026-08-10" },
    ])).toEqual([{ unitTypeId: 1, dateFrom: "2026-08-01", dateTo: "2026-08-10" }]);
  });
  it("różne typy osobno", () => {
    const out = coalesceRanges([
      { unitTypeId: 1, dateFrom: "2026-08-01", dateTo: "2026-08-02" },
      { unitTypeId: 2, dateFrom: "2026-08-01", dateTo: "2026-08-02" },
    ]);
    expect(out).toHaveLength(2);
  });
});
```

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implementacja** (enqueue + coalesce):
```ts
import { prisma } from "../db";

export async function enqueueAri(
  propertyId: number,
  unitTypeId: number,
  from: string,
  to: string
): Promise<void> {
  await prisma.ariOutbox.create({
    data: { propertyId, unitTypeId, dateFrom: from, dateTo: to, status: "PENDING" },
  });
}

type Range = { unitTypeId: number; dateFrom: string; dateTo: string };

/** Scala nachodzące/stykające się zakresy per unitType do jednego min–max. */
export function coalesceRanges(rows: Range[]): Range[] {
  const byType = new Map<number, Range[]>();
  for (const r of rows) {
    const arr = byType.get(r.unitTypeId) ?? [];
    arr.push(r);
    byType.set(r.unitTypeId, arr);
  }
  const out: Range[] = [];
  for (const [unitTypeId, arr] of byType) {
    arr.sort((a, b) => (a.dateFrom < b.dateFrom ? -1 : 1));
    let cur = { ...arr[0] };
    for (let i = 1; i < arr.length; i++) {
      if (arr[i].dateFrom <= cur.dateTo) {
        if (arr[i].dateTo > cur.dateTo) cur.dateTo = arr[i].dateTo;
      } else {
        out.push(cur);
        cur = { ...arr[i] };
      }
    }
    out.push(cur);
  }
  return out;
}
```

- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** `Feat: Channex - outbox enqueue + sklejanie zakresow`.

---

### Task 6: Worker outboxa (na stubie providera)

**Files:**
- Modify: `lib/channex/outbox.ts`
- Create: `lib/channex/outbox.worker.test.ts`

**Interfaces:**
- Consumes: `channelProvider`/`stubProvider` (Task 2), `roomTypeAvailability` (Task 3), `buildAriDays` (Task 4), `coalesceRanges` (Task 5), `ChannexProperty`/`ChannexRoom`.
- Produces: `processOutbox(propertyId: number, provider?: ChannelProvider): Promise<{ sent: number; failed: number }>` — pobiera PENDING danego obiektu, skleja, dla każdego zakresu liczy dostępność+minStay i woła `provider.pushAri` na Rate Planie/Room Type z `ChannexRoom`; oznacza wiersze `SENT` lub `ERROR` (+`attempts`,`lastError`) i loguje błędy (`logEvent kind:"CHANNEX"`). Gdy `ChannexProperty.status !== "ACTIVE"` → wiersze zostają PENDING (nie pushujemy w OFF/ICAL/PAUSED).

- [ ] **Step 1: Test workera ze stubem** (`lib/channex/outbox.worker.test.ts`) — wymaga bazy testowej (`TEST_DATABASE_URL`); używa realnych tabel + `stubProvider`. Test tworzy `Property(plan PRO, syncMode CHANNEX)`, `ChannexProperty(status ACTIVE)`, `UnitType`+`ChannexRoom`, 2 aktywne Unity, jedną rezerwację CONFIRMED, enqueue zakresu, wywołuje `processOutbox(propertyId, stubProvider)`:
```ts
// szkielet — pełny seed w implementacji; asercje:
// - stubProvider.calls zawiera 1 wywołanie na Rate Plan z dniami availability
// - dzień z rezerwacją ma availability o 1 mniejszą
// - wiersze AriOutbox mają status "SENT"
```
(Uwaga: ten test biega tylko z `TEST_DATABASE_URL`; bez niej `describe.skipIf(!process.env.TEST_DATABASE_URL)`.)

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implementacja `processOutbox`** w `lib/channex/outbox.ts`:
```ts
import { logEvent } from "../log";
import { channelProvider, type ChannelProvider } from "./provider";
import { roomTypeAvailability } from "./availability";
import { buildAriDays } from "./ari";

const MAX_ATTEMPTS = 5;

export async function processOutbox(
  propertyId: number,
  provider: ChannelProvider | null = channelProvider()
): Promise<{ sent: number; failed: number }> {
  if (!provider) return { sent: 0, failed: 0 };
  const cp = await prisma.channexProperty.findUnique({ where: { propertyId } });
  if (!cp || cp.status !== "ACTIVE") return { sent: 0, failed: 0 };

  const rows = await prisma.ariOutbox.findMany({
    where: { propertyId, status: { in: ["PENDING", "ERROR"] }, attempts: { lt: MAX_ATTEMPTS } },
  });
  if (rows.length === 0) return { sent: 0, failed: 0 };
  const ranges = coalesceRanges(
    rows.map((r) => ({ unitTypeId: r.unitTypeId, dateFrom: r.dateFrom, dateTo: r.dateTo }))
  );

  let sent = 0, failed = 0;
  for (const range of ranges) {
    const room = await prisma.channexRoom.findUnique({ where: { unitTypeId: range.unitTypeId } });
    const unitType = await prisma.unitType.findUnique({
      where: { id: range.unitTypeId },
      include: { seasons: true },
    });
    const ids = rows
      .filter((r) => r.unitTypeId === range.unitTypeId && r.dateFrom >= range.dateFrom && r.dateTo <= range.dateTo)
      .map((r) => r.id);
    try {
      if (!room?.channexRoomTypeId || !unitType) throw new Error("Brak mapowania Room Type");
      const avail = await roomTypeAvailability(range.unitTypeId, range.dateFrom, range.dateTo);
      const days = buildAriDays(avail, unitType.minStay, unitType.seasons);
      await provider.pushAri(cp.apiKey, room.channexRoomTypeId, room.channexRatePlanId, days);
      await prisma.ariOutbox.updateMany({ where: { id: { in: ids } }, data: { status: "SENT" } });
      sent += ids.length;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await prisma.ariOutbox.updateMany({
        where: { id: { in: ids } },
        data: { status: "ERROR", attempts: { increment: 1 }, lastError: msg.slice(0, 300) },
      });
      await logEvent({ kind: "CHANNEX", level: "ERROR", propertyId, message: `Push ARI nieudany`, meta: msg.slice(0, 200) });
      failed += ids.length;
    }
  }
  return { sent, failed };
}
```
Import `coalesceRanges`/`prisma` już w pliku. Dodać import `roomTypeAvailability`, `buildAriDays`, `channelProvider`, `logEvent`.

- [ ] **Step 4: PASS** (z `TEST_DATABASE_URL`); bez niej test się pomija, ale `npx vitest run` całości musi być zielone.
- [ ] **Step 5: Commit** `Feat: Channex - worker outboxa (push ARI przez providera)`.

---

### Task 7: Wyzwalacze ARI w akcjach + cron

**Files:**
- Modify: `lib/actions.ts` (akcje zmieniające dostępność), `lib/jobs.ts` (funkcja zbiorcza), `app/api/cron/sync-ical/route.ts` (wywołanie w cronie)
- Create: `lib/channex/enqueue-helpers.ts`

**Interfaces:**
- Consumes: `enqueueAri` (Task 5), `processOutbox` (Task 6).
- Produces: `afterAri(propertyId, unitTypeId, from, to)` — enqueue + `after(() => processOutbox(propertyId))`; `processAllOutbox(): Promise<number>` (cron: przetwarza wszystkie obiekty ze statusem ACTIVE).

- [ ] **Step 1: Helper** `lib/channex/enqueue-helpers.ts`:
```ts
import { after } from "next/server";
import { enqueueAri } from "./outbox";
import { processOutbox } from "./outbox";

/** Zapis zadania ARI + best-effort push zaraz po akcji (poza ścieżką odpowiedzi). */
export async function afterAri(propertyId: number, unitTypeId: number, from: string, to: string): Promise<void> {
  await enqueueAri(propertyId, unitTypeId, from, to);
  after(() => processOutbox(propertyId));
}
```

- [ ] **Step 2: Podpiąć w akcjach `lib/actions.ts`** — w akcjach zmieniających dostępność, po zapisie w DB, wywołać `afterAri(property.id, unitTypeId, from, to)`. Miejsca (odszukać po nazwach; dodać wywołanie, nie zmieniać logiki):
  - `createReservation` (po utworzeniu — zakres `checkIn..checkOut`, `unitTypeId` z jednostki),
  - `adminSetStatus` (CONFIRM/CANCEL — zakres rezerwacji),
  - `changeReservationDates`/`adminUpdateReservation` (stary i nowy zakres),
  - `cancelByGuest`,
  - `addBlock`/`adminDeleteBlock` (zakres bloku MANUAL),
  - `toggleUnitActive`, `addUnit`, `deleteUnit` (pełne okno: `todayISO()` .. `addDaysISO(todayISO(), 540)`).
  Dla każdego: `unitTypeId` = `unit.unitTypeId` (dociągnąć jeśli trzeba). Enqueue tylko gdy `property.syncMode === "CHANNEX"` (wczytać property.syncMode; w trybach innych niż CHANNEX nie kolejkujemy).

  Wzorzec (przykład w `adminSetStatus` po zmianie statusu):
```ts
if (property.syncMode === "CHANNEX") {
  await afterAri(property.id, r.unit.unitTypeId, r.checkIn, r.checkOut);
}
```

- [ ] **Step 3: Cron** — `lib/jobs.ts` dopisać:
```ts
import { processOutbox } from "./channex/outbox";
export async function processAllChannexOutbox(): Promise<number> {
  const active = await prisma.channexProperty.findMany({
    where: { status: "ACTIVE" }, select: { propertyId: true },
  });
  let total = 0;
  for (const cp of active) {
    const { sent } = await processOutbox(cp.propertyId);
    total += sent;
  }
  return total;
}
```
W `app/api/cron/sync-ical/route.ts` po `syncAllIcalFeeds()` dodać `const channex = await processAllChannexOutbox();` i dołożyć do odpowiedzi JSON. (Import z `@/lib/jobs`.)

- [ ] **Step 4: Weryfikacja** — `npm run lint`; test dymny z `CHANNEX_STUB=1` i `TEST_DATABASE_URL`: utworzyć rezerwację → sprawdzić, że powstał wiersz `AriOutbox`. Jeśli brak bazy testowej: `npx tsc --noEmit` musi przejść, a ręczny smoke opisany w komentarzu commita.
- [ ] **Step 5: Commit** `Feat: Channex - wyzwalacze ARI w akcjach + cron`.

---

### Task 8: Przełącznik trybu synchronizacji (UI + akcja)

**Files:**
- Create: `lib/channex/sync-actions.ts` ("use server"), `components/admin/SyncModeSwitch.tsx` (client)
- Modify: `app/admin/kanaly/page.tsx`

**Interfaces:**
- Consumes: `channelSyncFeatures` (Task 2), `channelProvider` (Task 2).
- Produces: `setSyncMode(formData: FormData): Promise<void>` — waluje wartość (`OFF|ICAL|CHANNEX`), gating (`CHANNEX` wymaga `channelSyncFeatures(plan).channex` i `channelProvider() !== null`), zapis `Property.syncMode`, `revalidatePath("/admin/kanaly")`, `redirect("/admin/kanaly?saved=1")`. (Provisioning przy wejściu w CHANNEX dochodzi w Planie B — tu tryb zapisujemy, status `ChannexProperty` zostaje `NONE`, panel pokazuje „konfiguracja w toku/niedostępna".)

- [ ] **Step 1: Akcja** `lib/channex/sync-actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "../auth";
import { prisma } from "../db";
import { channelSyncFeatures } from "../plans";
import { channelProvider } from "./provider";

const MODES = ["OFF", "ICAL", "CHANNEX"] as const;

export async function setSyncMode(formData: FormData): Promise<void> {
  const { property } = await requireOwner();
  const mode = String(formData.get("mode") ?? "");
  const fail = (m: string) => redirect(`/admin/kanaly?error=${encodeURIComponent(m)}`);
  if (!MODES.includes(mode as (typeof MODES)[number])) fail("Nieznany tryb synchronizacji.");
  const feat = channelSyncFeatures(property.plan);
  if (mode === "ICAL" && !feat.ical) fail("Synchronizacja iCal jest dostępna od planu Standard.");
  if (mode === "CHANNEX" && (!feat.channex || !channelProvider()))
    fail("Channex jest dostępny w planie Pro po włączeniu integracji na platformie.");
  await prisma.property.update({ where: { id: property.id }, data: { syncMode: mode } });
  revalidatePath("/admin/kanaly");
  redirect("/admin/kanaly?saved=1");
}
```

- [ ] **Step 2: Przełącznik** `components/admin/SyncModeSwitch.tsx` (client, segmentowany; wysyła `setSyncMode` z hidden `mode` przez `<form>`; opcja CHANNEX disabled gdy `!channexEnabled`):
```tsx
"use client";
import SubmitButton from "@/components/ui/SubmitButton";
import { setSyncMode } from "@/lib/channex/sync-actions";

const OPTS = [
  { value: "OFF", label: "Bez synchronizacji" },
  { value: "ICAL", label: "iCal" },
  { value: "CHANNEX", label: "Channex (2-way)" },
] as const;

export default function SyncModeSwitch({ mode, channexEnabled }: { mode: string; channexEnabled: boolean }) {
  return (
    <div className="inline-flex rounded-[12px] border border-slate-200 bg-white p-1">
      {OPTS.map((o) => {
        const active = o.value === mode;
        const disabled = o.value === "CHANNEX" && !channexEnabled;
        return (
          <form key={o.value} action={setSyncMode}>
            <input type="hidden" name="mode" value={o.value} />
            <SubmitButton
              disabled={disabled || active}
              title={disabled ? "Dostępne w planie Pro po włączeniu integracji" : undefined}
              className={`rounded-[9px] px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                active ? "bg-brand-900 text-white" : "text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              }`}
            >
              {o.label}
            </SubmitButton>
          </form>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Wpiąć w `app/admin/kanaly/page.tsx`** — u góry, nad listą, wczytać `property.syncMode`, `channelSyncFeatures(property.plan).channex && channelProvider() !== null` → `channexEnabled`; wyrenderować nagłówek z `<SyncModeSwitch mode={property.syncMode} channexEnabled={channexEnabled} />`. Sekcje iCal (istniejące) pokazywać tylko gdy `syncMode === "ICAL"`; gdy `CHANNEX` — placeholder „Integracja Channex — konfiguracja w Planie B" (docelowo panel kanałów). Gdy `OFF` — informacja, że kanały wyłączone. (Import `channelProvider` z `@/lib/channex/provider`, `channelSyncFeatures` z `@/lib/plans`.)

- [ ] **Step 4: Weryfikacja w przeglądarce** (`CHANNEX_STUB=1 npm run dev`): na `/admin/kanaly` widać przełącznik; przełączenie ICAL↔OFF działa (toast „Zapisano zmiany."); dla planu STANDARD segment Channex wyszarzony; po ustawieniu planu PRO + `CHANNEX_STUB=1` segment aktywny, wybór zapisuje `syncMode=CHANNEX`.
- [ ] **Step 5: Commit** `Feat: Channex - przelacznik trybu synchronizacji (OFF/iCal/Channex)`.

---

### Task 9: Panel „Log synchronizacji"

**Files:**
- Create: `components/admin/SyncLog.tsx` (server)
- Modify: `app/admin/kanaly/page.tsx`, `lib/log.ts` (jeśli trzeba dopuścić `kind: "CHANNEX"`)

**Interfaces:**
- Consumes: `EventLog` (`kind IN ("ICAL","CHANNEX")`, `propertyId`), `AriOutbox` (ostatnie `ERROR`).
- Produces: `<SyncLog propertyId={number} />` — server component listujący ostatnie ~30 zdarzeń chronologicznie.

- [ ] **Step 1: Dopuścić kind CHANNEX** — sprawdzić `lib/log.ts`: jeśli `kind` jest typem zamkniętym, dodać `"CHANNEX"`; jeśli `string`, bez zmian. (Komentarz w `schema.prisma` przy `EventLog.kind` zaktualizować o `CHANNEX`.)

- [ ] **Step 2: Komponent** `components/admin/SyncLog.tsx`:
```tsx
import { prisma } from "@/lib/db";
import { formatDatePl } from "@/lib/dates";

export default async function SyncLog({ propertyId }: { propertyId: number }) {
  const logs = await prisma.eventLog.findMany({
    where: { propertyId, kind: { in: ["ICAL", "CHANNEX"] } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  if (logs.length === 0) {
    return <p className="text-sm text-slate-400">Brak zdarzeń synchronizacji.</p>;
  }
  return (
    <div className="card divide-y divide-slate-100">
      {logs.map((l) => (
        <div key={l.id} className="flex items-start gap-3 px-4 py-2.5 text-[13px]">
          <span className={`mt-0.5 h-2 w-2 flex-none rounded-full ${
            l.level === "ERROR" ? "bg-red-500" : l.level === "WARN" ? "bg-amber-500" : "bg-brand-500"
          }`} />
          <span className="flex-1">
            <span className="font-semibold">{l.message}</span>
            {l.meta && <span className="block text-xs text-slate-400">{l.meta}</span>}
          </span>
          <time className="flex-none text-xs text-slate-400">
            {new Date(l.createdAt).toLocaleString("pl-PL")}
          </time>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Wpiąć w `app/admin/kanaly/page.tsx`** — pod przełącznikiem/sekcjami dodać sekcję „Log synchronizacji" z `<SyncLog propertyId={property.id} />`.

- [ ] **Step 4: Weryfikacja** — wywołać ręcznie `logEvent({kind:"CHANNEX",level:"INFO",propertyId,message:"Test"})` skryptem tsx, odświeżyć `/admin/kanaly` — wpis widoczny. `npm run lint`.
- [ ] **Step 5: Commit** `Feat: Channex - panel Log synchronizacji`.

---

### Task 10: Dokumentacja + pełne testy

**Files:**
- Modify: `docs/FUNKCJE.md`, `README.md`, `.env.example`

- [ ] **Step 1: `.env.example`** — dopisać sekcję (bez wartości):
```
# Channel manager Channex (Plan B podłącza realny klient). Puste = tryb Channex ukryty.
# CHANNEX_STUB=1 wymusza stub providera w dev (bez realnego API).
CHANNEX_BASE_URL=""
CHANNEX_API_KEY=""
CHANNEX_WEBHOOK_SECRET=""
```
- [ ] **Step 2: `docs/FUNKCJE.md`** — w sekcji Channel manager dopisać akapit o trybach `OFF/ICAL/CHANNEX`, outboxie i logu synchronizacji (Plan A); zaznaczyć, że realna integracja Channex (provisioning, push, webhooki, connect) dochodzi w planach B–D.
- [ ] **Step 3: `README.md`** — w „Poza MVP / integracje" wzmianka o Channex (2-way, PRO).
- [ ] **Step 4: Pełny zestaw** — `npx vitest run` (zielone), `npm run lint` (czyste). E2E opcjonalnie: przełącznik trybu (stub) — jeśli dokładamy, to `tests/e2e/channels-sync.spec.ts` (login → /admin/kanaly → przełącz ICAL→OFF→ICAL, sprawdź toast). W przeciwnym razie odnotować w commicie brak e2e dla tego planu.
- [ ] **Step 5: Commit** `Feat: Channex Plan A - dokumentacja i testy`.

---

## Self-review planu (Plan A)

- Pokrycie spec (część niezależna od Channex): model danych (T1), abstrakcja providera + gating (T2), dostępność per Room Type (T3), restrykcje/ARI payload (T4), outbox enqueue+coalesce (T5), worker (T6), wyzwalacze w akcjach + cron (T7), przełącznik trybu (T8), log synchronizacji (T9), docs/testy (T10). Prowisioning, realny push, webhooki, connect kanałów, ceny — świadomie w planach B/C/D (poza zakresem A).
- Spójność typów: `AriDay` (Task 2) używane w T4/T6; `ChannelProvider.pushAri(apiKey, roomTypeId, ratePlanId, days)` spójne T2↔T6; `roomTypeAvailability`/`countFreePerDay` (T3) użyte w T6; `enqueueAri`/`coalesceRanges` (T5) w T6/T7; `channelSyncFeatures` (T2) w T8. Nazwy pól modeli (T1) zgodne z użyciem w T6/T8/T9.
- Bez placeholderów: kroki logiki mają pełny kod; kroki UI/akcji podają konkretny kod i dokładne miejsca wpięcia. Testy zależne od DB oznaczone jako pomijane bez `TEST_DATABASE_URL` (reszta zielona bez bazy).
