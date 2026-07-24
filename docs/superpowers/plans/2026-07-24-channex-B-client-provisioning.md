# Channex — Plan B: Realny klient, provisioning, push ARI — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Podmienić stub na realny klient Channex: provisioning obiektu (Property + Room Type + Rate Plan) przy włączeniu trybu CHANNEX i faktyczny push ARI (availability + restrictions) na sandboxie.

**Wymaga:** ukończonego Planu A (interfejsy `ChannelProvider`, `AriDay`, `outbox`, `ChannexProperty/Room`, przełącznik trybu). Konto sandbox Channex — klucz w `.env` (`CHANNEX_API_KEY`), NIGDY w repo.

**Realne API Channex** (potwierdzone z docs, sandbox `https://staging.channex.io/api/v1`):
- Auth: nagłówek `user-api-key: <klucz>`.
- `POST /properties` — body `{ property: { title, currency, timezone, settings:{...}, content:{...} } }` (wymagane `title`, `currency`) → `data.id` = property UUID.
- `POST /room_types` — `{ room_type: { property_id, title, count_of_rooms, occ_adults, occ_children, occ_infants, default_occupancy, room_kind } }` → `data.id`.
- `POST /rate_plans` — `{ rate_plan: { property_id, room_type_id, title, currency } }` → `data.id`. (Domyślnie rate=0, min_stay=1; wartości dobowe idą przez ARI.)
- `POST /availability` — `{ values: [{ property_id, room_type_id, date_from, date_to, availability }] }`.
- `POST /restrictions` — `{ values: [{ property_id, rate_plan_id, date_from, date_to, min_stay_arrival }] }`.
- `GET /bookings/:id` — `data.attributes` (Plan C).

## Global Constraints

Jak w Planie A (Next 16, daty `YYYY-MM-DD`, grosze, gating PRO, brak konfiguracji = Channex ukryty). Dodatkowo:
- Kwoty do Channex w jednostkach waluty jako string (np. `"300.00"`) — w MVP **cen nie wysyłamy** (tylko availability + min_stay), więc bez konwersji groszy.
- Klient: timeout 15 s, retry 2x na 5xx/timeout, mapowanie błędów na `Error` z treścią z odpowiedzi Channex.
- **Rewizja interfejsu z Planu A:** `ChannelProvider.pushAri` dostaje dodatkowo `channexPropertyId` (Channex wymaga `property_id` w payloadzie ARI). Nowa sygnatura: `pushAri(apiKey, channexPropertyId, roomTypeId, ratePlanId, days)`. Zaktualizować wywołanie w workerze (`lib/channex/outbox.ts` — przekazać `cp.channexId`) oraz stub.

---

### Task 1: Konfiguracja Channex w ustawieniach platformy

**Files:** Modify: `lib/settings.ts`, `lib/channex/provider.ts`

- [ ] **Step 1:** W `SETTING_SECTIONS` dodać sekcję:
```ts
{
  id: "channex",
  title: "Channel manager — Channex",
  description:
    "Dwukierunkowa synchronizacja z OTA (Booking.com, Airbnb…). Bez klucza tryb Channex jest ukryty w panelach obiektów.",
  requiredKeys: ["CHANNEX_API_KEY"],
  fields: [
    { key: "CHANNEX_API_KEY", label: "user-api-key", secret: true, placeholder: "…" },
    { key: "CHANNEX_BASE_URL", label: "Base URL", secret: false, placeholder: "https://staging.channex.io/api/v1" },
    { key: "CHANNEX_WEBHOOK_SECRET", label: "Sekret webhooka", secret: true },
  ],
},
```
- [ ] **Step 2:** `channelProvider()` w `lib/channex/provider.ts` — kolejność: `CHANNEX_STUB=1` → stub; w przeciwnym razie jeśli `getSetting("CHANNEX_API_KEY")` niepuste → `new ChannexClient(...)` (Task 2); inaczej `null`. Uwaga: `getSetting` jest async (react cache) — `channelProvider` zmienia się na `async channelProvider(): Promise<ChannelProvider | null>`; zaktualizować wywołania (worker, sync-actions) na `await`. Zaktualizować testy Planu A odpowiednio (stub ścieżka bez zmian).
- [ ] **Step 3:** Weryfikacja `npm run lint`, `npx vitest run` zielone.
- [ ] **Step 4:** Commit `Feat: Channex - konfiguracja platformy + wybor providera`.

---

### Task 2: Klient Channex (`ChannexClient`) — request + pushAri

**Files:** Create: `lib/channex/client.ts`, `lib/channex/client.test.ts`

**Interfaces (Produces):** `class ChannexClient implements ChannelProvider` z konstruktorem `(apiKey: string, baseUrl: string)`. Metoda pomocnicza `request(method, path, body?)`. `pushAri(apiKey, channexPropertyId, roomTypeId, ratePlanId, days)` → `POST /availability` (availability z `days`) + `POST /restrictions` (min_stay_arrival z `days`). Builder payloadów wydzielony jako czyste funkcje (testowalne bez sieci):
```ts
export function availabilityValues(propertyId, roomTypeId, days): {property_id;room_type_id;date:string;availability:number}[]
export function restrictionValues(propertyId, ratePlanId, days): {property_id;rate_plan_id;date:string;min_stay_arrival:number}[]
```

- [ ] **Step 1: Test builderów** (`client.test.ts`, czyste):
```ts
import { describe, expect, it } from "vitest";
import { availabilityValues, restrictionValues } from "./client";
const days = [{ date: "2026-08-01", availability: 2, minStay: 3 }];
it("availabilityValues mapuje na payload Channex", () => {
  expect(availabilityValues("P", "RT", days)).toEqual([
    { property_id: "P", room_type_id: "RT", date: "2026-08-01", availability: 2 },
  ]);
});
it("restrictionValues mapuje minStay na min_stay_arrival", () => {
  expect(restrictionValues("P", "RP", days)).toEqual([
    { property_id: "P", rate_plan_id: "RP", date: "2026-08-01", min_stay_arrival: 3 },
  ]);
});
```
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementacja** `lib/channex/client.ts`:
```ts
import type { AriDay, BookingData, ChannelProvider, ProvisionInput, ProvisionResult } from "./provider";

export function availabilityValues(propertyId: string, roomTypeId: string, days: AriDay[]) {
  return days.map((d) => ({ property_id: propertyId, room_type_id: roomTypeId, date: d.date, availability: d.availability }));
}
export function restrictionValues(propertyId: string, ratePlanId: string, days: AriDay[]) {
  return days.map((d) => ({ property_id: propertyId, rate_plan_id: ratePlanId, date: d.date, min_stay_arrival: d.minStay }));
}

export class ChannexClient implements ChannelProvider {
  constructor(private apiKey: string, private baseUrl: string) {}

  private async request(method: string, path: string, body?: unknown): Promise<any> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: { "user-api-key": this.apiKey, "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(15_000),
        });
        if (res.status >= 500) throw new Error(`Channex HTTP ${res.status}`);
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          const detail = json?.errors ? JSON.stringify(json.errors) : `HTTP ${res.status}`;
          throw new Error(`Channex: ${detail}`);
        }
        return json;
      } catch (e) {
        lastErr = e;
        if (attempt === 2) break;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  async pushAri(apiKey: string, channexPropertyId: string, roomTypeId: string, ratePlanId: string, days: AriDay[]): Promise<void> {
    await this.request("POST", "/availability", { values: availabilityValues(channexPropertyId, roomTypeId, days) });
    if (ratePlanId) {
      await this.request("POST", "/restrictions", { values: restrictionValues(channexPropertyId, ratePlanId, days) });
    }
  }

  async provisionProperty(input: ProvisionInput): Promise<ProvisionResult> { /* Task 3 */ throw new Error("nie zaimplementowano"); }
  async getBooking(apiKey: string, bookingId: string): Promise<BookingData | null> { /* Plan C */ throw new Error("nie zaimplementowano"); }
}
```
(`apiKey` w sygnaturze metod pozostaje dla zgodności interfejsu — klient i tak używa własnego `this.apiKey`; ujednolica to stub i realny klient.)
- [ ] **Step 4: PASS.** Zaktualizować sygnaturę `pushAri` w `provider.ts` (interfejs + stub: dodać `channexPropertyId` jako 2. argument) i w workerze (`processOutbox`: `provider.pushAri(cp.apiKey, cp.channexId, room.channexRoomTypeId, room.channexRatePlanId, days)`). Uruchomić testy Planu A — zielone.
- [ ] **Step 5: Commit** `Feat: Channex - klient (request + pushAri) i buildery payloadu`.

---

### Task 3: Provisioning obiektu (Property + Room Types + Rate Plans)

**Files:** Modify: `lib/channex/client.ts`; Create: `lib/channex/provision.ts`, `lib/channex/provision.test.ts`

**Interfaces (Produces):**
- `ChannexClient.provisionProperty(input)` — `POST /properties`, potem dla każdego `rooms[]`: `POST /room_types` + `POST /rate_plans`; zwraca `{ channexPropertyId, apiKey, rooms:[{unitTypeId, roomTypeId, ratePlanId}] }`. (apiKey = ten sam klucz konta; per-property key opcjonalny — w MVP używamy klucza konta i zapisujemy go do `ChannexProperty.apiKey`.)
- `lib/channex/provision.ts`: `provisionForProperty(propertyId: number): Promise<void>` — pobiera obiekt + typy pokoi + liczbę aktywnych Unitów, buduje `ProvisionInput`, woła provider, zapisuje `ChannexProperty`(status ACTIVE, channexId, apiKey) + `ChannexRoom` per typ, loguje `CHANNEX INFO`. Błąd → status ERROR + lastError + log ERROR + rzuca dalej.

- [ ] **Step 1: Test mapowania ProvisionInput** (czysta funkcja `buildProvisionInput(property, unitTypes)`):
```ts
import { describe, expect, it } from "vitest";
import { buildProvisionInput } from "./provision";
it("buduje wejście provisioningu z obiektu i typów", () => {
  const p = { name: "Willa", address: "ul. X 1, Giżycko", checkInFrom: "15:00", checkOutTo: "11:00" };
  const types = [{ id: 7, name: "Apartament", maxGuests: 4, activeUnits: 2 }];
  const inp = buildProvisionInput(p as any, types);
  expect(inp).toMatchObject({ name: "Willa", currency: "PLN", timezone: "Europe/Warsaw",
    rooms: [{ unitTypeId: 7, title: "Apartament", occupancy: 4, count: 2 }] });
});
```
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementacja** — `provisionProperty` w kliencie:
```ts
async provisionProperty(input: ProvisionInput): Promise<ProvisionResult> {
  const prop = await this.request("POST", "/properties", {
    property: {
      title: input.name, currency: input.currency, timezone: input.timezone,
      address: input.address || undefined,
      settings: { allow_availability_autoupdate_on_confirmation: true },
      content: {},
    },
  });
  const channexPropertyId = prop.data.id as string;
  const rooms: ProvisionResult["rooms"] = [];
  for (const r of input.rooms) {
    const rt = await this.request("POST", "/room_types", {
      room_type: {
        property_id: channexPropertyId, title: r.title, count_of_rooms: r.count,
        occ_adults: r.occupancy, occ_children: 0, occ_infants: 0,
        default_occupancy: r.occupancy, room_kind: "room",
      },
    });
    const roomTypeId = rt.data.id as string;
    const rp = await this.request("POST", "/rate_plans", {
      rate_plan: { property_id: channexPropertyId, room_type_id: roomTypeId, title: r.title, currency: input.currency },
    });
    rooms.push({ unitTypeId: r.unitTypeId, roomTypeId, ratePlanId: rp.data.id as string });
  }
  return { channexPropertyId, apiKey: this.apiKey, rooms };
}
```
`lib/channex/provision.ts`:
```ts
import { prisma } from "../db";
import { logEvent } from "../log";
import { channelProvider } from "./provider";
import type { ProvisionInput } from "./provider";

export function buildProvisionInput(
  property: { name: string; address: string; checkInFrom: string; checkOutTo: string },
  types: { id: number; name: string; maxGuests: number; activeUnits: number }[]
): ProvisionInput {
  return {
    name: property.name, address: property.address, currency: "PLN", timezone: "Europe/Warsaw",
    checkInFrom: property.checkInFrom, checkOutTo: property.checkOutTo,
    rooms: types.map((t) => ({ unitTypeId: t.id, title: t.name, occupancy: t.maxGuests, count: t.activeUnits })),
  };
}

export async function provisionForProperty(propertyId: number): Promise<void> {
  const provider = await channelProvider();
  if (!provider) throw new Error("Channex nie jest skonfigurowany.");
  const property = await prisma.property.findUniqueOrThrow({
    where: { id: propertyId },
    include: { unitTypes: { include: { units: { where: { active: true }, select: { id: true } } } } },
  });
  const types = property.unitTypes.map((t) => ({ id: t.id, name: t.name, maxGuests: t.maxGuests, activeUnits: t.units.length }));
  const input = buildProvisionInput(property, types);
  try {
    const res = await provider.provisionProperty(input);
    await prisma.$transaction(async (tx) => {
      await tx.channexProperty.upsert({
        where: { propertyId },
        create: { propertyId, channexId: res.channexPropertyId, apiKey: res.apiKey, status: "ACTIVE", syncedAt: new Date() },
        update: { channexId: res.channexPropertyId, apiKey: res.apiKey, status: "ACTIVE", lastError: "", syncedAt: new Date() },
      });
      for (const r of res.rooms) {
        await tx.channexRoom.upsert({
          where: { unitTypeId: r.unitTypeId },
          create: { unitTypeId: r.unitTypeId, channexRoomTypeId: r.roomTypeId, channexRatePlanId: r.ratePlanId },
          update: { channexRoomTypeId: r.roomTypeId, channexRatePlanId: r.ratePlanId },
        });
      }
    });
    await logEvent({ kind: "CHANNEX", level: "INFO", propertyId, message: "Obiekt zsynchronizowany z Channex (provisioning)" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.channexProperty.upsert({
      where: { propertyId },
      create: { propertyId, status: "ERROR", lastError: msg.slice(0, 300) },
      update: { status: "ERROR", lastError: msg.slice(0, 300) },
    });
    await logEvent({ kind: "CHANNEX", level: "ERROR", propertyId, message: "Provisioning Channex nieudany", meta: msg.slice(0, 200) });
    throw e;
  }
}
```
- [ ] **Step 4: PASS** (test buildera). Test provisioningu end-to-end na sandboxie: `CHANNEX_STUB=` (realny), z `TEST_DATABASE_URL` — opcjonalny skrypt tsx wołający `provisionForProperty` i sprawdzający utworzenie rekordów; wykonać ręcznie z kluczem sandbox.
- [ ] **Step 5: Commit** `Feat: Channex - provisioning obiektu (Property/Room Type/Rate Plan)`.

---

### Task 4: Włączenie CHANNEX uruchamia provisioning + pełny push

**Files:** Modify: `lib/channex/sync-actions.ts` (z Planu A), `app/admin/kanaly/page.tsx`

**Interfaces:** `setSyncMode` przy przejściu na `CHANNEX`: zapis `syncMode=CHANNEX`, następnie `after(() => provisionForProperty(property.id).then(fullResyncEnqueue))`. `fullResyncEnqueue(propertyId)` — dla każdego typu enqueue ARI na okno `dziś .. +540 dni` i `processOutbox`.

- [ ] **Step 1:** Dodać do `lib/channex/enqueue-helpers.ts` (Plan A):
```ts
import { todayISO, addDaysISO } from "../dates";
import { prisma } from "../db";
import { enqueueAri, processOutbox } from "./outbox";

export async function fullResync(propertyId: number): Promise<void> {
  const from = todayISO();
  const to = addDaysISO(from, 540);
  const types = await prisma.unitType.findMany({ where: { propertyId }, select: { id: true } });
  for (const t of types) await enqueueAri(propertyId, t.id, from, to);
  await processOutbox(propertyId);
}
```
- [ ] **Step 2:** W `setSyncMode` po zapisaniu `CHANNEX`:
```ts
if (mode === "CHANNEX") {
  after(async () => {
    try { await provisionForProperty(property.id); await fullResync(property.id); } catch { /* status ERROR już zapisany */ }
  });
}
```
(import `after` z `next/server`, `provisionForProperty` z `./provision`, `fullResync` z `./enqueue-helpers`.)
- [ ] **Step 3:** W `app/admin/kanaly/page.tsx` (tryb CHANNEX): pokazać status `ChannexProperty` (Provisioning/Aktywny/Błąd + `lastError` + przycisk „Ponów" wołający akcję `retryProvision` = `provisionForProperty`), oraz przycisk „Wymuś pełną synchronizację" (akcja `forceResync` = `fullResync`). Obie akcje: `requireOwner` + gating + `revalidate` + `redirect(?saved=1)`.
- [ ] **Step 4:** Weryfikacja na sandboxie: PRO + klucz → przełączenie na Channex tworzy obiekt w panelu Channex (sprawdzić w dashboardzie sandbox), status „Aktywny", `AriOutbox` → `SENT`.
- [ ] **Step 5:** Commit `Feat: Channex - wlaczenie trybu uruchamia provisioning i pelny push`.

---

## Self-review (Plan B)
- Pokrycie: konfiguracja platformy (T1), klient+pushAri (T2), provisioning (T3), włączenie→provisioning→push (T4). Rewizja `pushAri` o `channexPropertyId` odnotowana i wsteczna do Planu A (stub+worker zaktualizowane).
- Realne payloady z docs Channex (properties/room_types/rate_plans/availability/restrictions) użyte verbatim w kształcie.
- Brak placeholderów w logice; test end-to-end na sandboxie oznaczony jako ręczny (wymaga klucza).
