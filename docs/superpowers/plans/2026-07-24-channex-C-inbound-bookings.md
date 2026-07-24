# Channex — Plan C: Inbound (webhook → rezerwacja) — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Odbierać rezerwacje z OTA: webhook Channex → autorytatywny re-fetch bookingu → utworzenie/aktualizacja `Reservation` z auto-assign wolnego Unitu, obsługą oversell (konflikt) i idempotencją.

**Wymaga:** Planów A i B (klient Channex, `ChannexProperty/Room`, `Reservation.channexBookingId`, log CHANNEX).

**Realne API (z docs):**
- Webhook rejestrowany: `POST /webhooks` `{ property_id, callback_url, event_mask, headers:{ "X-Channex-Webhook-Secret": "…" }, is_active:true, send_data:true }`. Zdarzenia bookingowe: `booking` (wszystkie rewizje). **Webhooki mogą przychodzić poza kolejnością → traktujemy jako trigger do pobrania danych.**
- Payload webhooka: `{ event, payload:{ booking_id, property_id, revision_id }, property_id, timestamp }`.
- `GET /bookings/:id` → `data.attributes`: `{ id, property_id, status ("new"|"modified"|"cancelled"), ota_reservation_code, ota_name ("Booking.com"|"Airbnb"|…), arrival_date, departure_date, currency, amount ("220.00"), customer:{ name, surname, mail, phone }, rooms:[{ room_type_id, occupancy:{adults,children}, days }] }`.

## Global Constraints

Jak w Planach A/B. Dodatkowo:
- Kwoty z Channex to string w jednostkach waluty (`"220.00"`) → grosze: `Math.round(parseFloat(amount) * 100)`.
- `ota_name` → nasze `source`: mapowanie `"Booking.com"→BOOKING`, `"Airbnb"→AIRBNB`, `"Expedia"→EXPEDIA`, reszta `CHANNEX_OTHER`.
- Endpoint webhooka: zawsze szybkie `200`, przetwarzanie w `after()`; idempotencja po `channexBookingId`.
- Rezerwacja z OTA: status `CONFIRMED`, `depositGr=0`, `expiresAt=null`, własny kod `HO-…`; brak automatycznych e-maili/SMS/meldunku.

---

### Task 1: getBooking w kliencie + mapper payloadu → BookingData

**Files:** Modify: `lib/channex/client.ts`; Create: `lib/channex/booking-map.ts`, `lib/channex/booking-map.test.ts`

**Interfaces (Produces):**
- `ChannexClient.getBooking(apiKey, bookingId)` → `GET /bookings/:id`, mapuje `data.attributes` na `BookingData` (typ z Planu A) przez czysty `mapChannexBooking(attributes): BookingData`.
- `otaNameToSource(otaName: string): string`.

- [ ] **Step 1: Test mappera** (`booking-map.test.ts`, czysty):
```ts
import { describe, expect, it } from "vitest";
import { mapChannexBooking, otaNameToSource } from "./booking-map";
const attrs = {
  id: "b1", property_id: "P", status: "new", revision_id: "r1",
  ota_reservation_code: "1556013801", ota_name: "Booking.com",
  arrival_date: "2026-08-01", departure_date: "2026-08-04", currency: "PLN", amount: "660.00",
  customer: { name: "Jan", surname: "Kowalski", mail: "j@x.pl", phone: "600100200" },
  rooms: [{ room_type_id: "RT7", occupancy: { adults: 2, children: 1 }, days: {} }],
};
it("mapuje booking Channex na BookingData", () => {
  expect(mapChannexBooking(attrs as any)).toEqual({
    channexBookingId: "b1", channexPropertyId: "P", channexRoomTypeId: "RT7",
    channel: "BOOKING", status: "new", revision: expect.any(Number),
    arrival: "2026-08-01", departure: "2026-08-04", guests: 3,
    guestName: "Jan Kowalski", email: "j@x.pl", phone: "600100200",
    totalGr: 66000, commissionGr: 0,
  });
});
it("mapuje ota_name na source", () => {
  expect(otaNameToSource("Airbnb")).toBe("AIRBNB");
  expect(otaNameToSource("Nieznany")).toBe("CHANNEX_OTHER");
});
```
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementacja** `lib/channex/booking-map.ts`:
```ts
import type { BookingData } from "./provider";

export function otaNameToSource(otaName: string): string {
  const n = (otaName || "").toLowerCase();
  if (n.includes("booking")) return "BOOKING";
  if (n.includes("airbnb")) return "AIRBNB";
  if (n.includes("expedia")) return "EXPEDIA";
  return "CHANNEX_OTHER";
}

export function mapChannexBooking(a: any): BookingData {
  const room = a.rooms?.[0] ?? {};
  const occ = room.occupancy ?? {};
  const guests = (occ.adults ?? 0) + (occ.children ?? 0);
  const name = [a.customer?.name, a.customer?.surname].filter(Boolean).join(" ").trim();
  const revNum = Number(String(a.revision_id ?? "").replace(/\D/g, "").slice(0, 12)) || 0;
  return {
    channexBookingId: String(a.id),
    channexPropertyId: String(a.property_id),
    channexRoomTypeId: String(room.room_type_id ?? ""),
    channel: otaNameToSource(a.ota_name ?? ""),
    status: (a.status === "cancelled" ? "cancelled" : a.status === "modified" ? "modified" : "new"),
    revision: revNum,
    arrival: a.arrival_date, departure: a.departure_date,
    guests: Math.max(1, guests),
    guestName: name || "Gość OTA",
    email: a.customer?.mail ?? "",
    phone: a.customer?.phone ?? "",
    totalGr: Math.round(parseFloat(a.amount ?? "0") * 100),
    commissionGr: 0,
  };
}
```
`getBooking` w kliencie:
```ts
async getBooking(_apiKey: string, bookingId: string): Promise<BookingData | null> {
  const json = await this.request("GET", `/bookings/${bookingId}`);
  const attrs = json?.data?.attributes;
  return attrs ? mapChannexBooking(attrs) : null;
}
```
(import `mapChannexBooking` z `./booking-map`.)
- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** `Feat: Channex - getBooking + mapper payloadu na BookingData`.

---

### Task 2: Ingest rezerwacji — auto-assign, upsert, konflikty

**Files:** Create: `lib/channex/ingest.ts`, `lib/channex/ingest.test.ts`

**Interfaces (Produces):**
- `pickFreeUnit(units, reservations, from, to, excludeReservationId?): number | null` — czysta: pierwszy Unit bez nachodzącej rezerwacji w `[from,to)`.
- `ingestBooking(booking: BookingData): Promise<void>` — mapuje na obiekt/typ (`ChannexProperty.channexId`→property, `ChannexRoom.channexRoomTypeId`→unitType), upsert `Reservation` po `channexBookingId`:
  - `cancelled` → istniejącą ustaw `CANCELLED`; enqueue ARI.
  - `new/modified` → auto-assign wolnego Unitu typu na `[arrival, departure)`; brak wolnego → wybierz pierwszy Unit typu i zaloguj konflikt (`CHANNEX ERROR`); utwórz/zmień rezerwację (CONFIRMED, source=channel, kod HO-, `channexBookingId`, `otaCommissionGr`); enqueue ARI.

- [ ] **Step 1: Test pickFreeUnit** (czysty):
```ts
import { describe, expect, it } from "vitest";
import { pickFreeUnit } from "./ingest";
const units = [{ id: 1 }, { id: 2 }];
it("pomija jednostkę zajętą w zakresie", () => {
  const res = [{ unitId: 1, checkIn: "2026-08-01", checkOut: "2026-08-03" }];
  expect(pickFreeUnit(units, res, "2026-08-02", "2026-08-04")).toBe(2);
});
it("null gdy wszystkie zajęte", () => {
  const res = [{ unitId: 1, checkIn: "2026-08-01", checkOut: "2026-08-05" }, { unitId: 2, checkIn: "2026-08-01", checkOut: "2026-08-05" }];
  expect(pickFreeUnit(units, res, "2026-08-02", "2026-08-03")).toBeNull();
});
```
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementacja** `lib/channex/ingest.ts`:
```ts
import { randomInt } from "node:crypto";
import { prisma } from "../db";
import { logEvent } from "../log";
import type { BookingData } from "./provider";
import { afterAri } from "./enqueue-helpers";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function newCode(): string {
  let s = ""; for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `HO-${s}`;
}

export function pickFreeUnit(
  units: { id: number }[],
  reservations: { unitId: number; checkIn: string; checkOut: string }[],
  from: string, to: string, excludeReservationId?: number
): number | null {
  for (const u of units) {
    const busy = reservations.some((r) => r.unitId === u.id && r.checkIn < to && r.checkOut > from);
    if (!busy) return u.id;
  }
  return null;
}

export async function ingestBooking(b: BookingData): Promise<void> {
  const cp = await prisma.channexProperty.findFirst({ where: { channexId: b.channexPropertyId }, select: { propertyId: true } });
  const room = await prisma.channexRoom.findFirst({ where: { channexRoomTypeId: b.channexRoomTypeId }, select: { unitTypeId: true } });
  if (!cp || !room) {
    await logEvent({ kind: "CHANNEX", level: "ERROR", propertyId: cp?.propertyId, message: "Rezerwacja OTA bez mapowania obiektu/pokoju", meta: b.channexBookingId });
    return;
  }
  const existing = await prisma.reservation.findUnique({ where: { channexBookingId: b.channexBookingId } });

  if (b.status === "cancelled") {
    if (existing) {
      await prisma.reservation.update({ where: { id: existing.id }, data: { status: "CANCELLED" } });
      await afterAri(cp.propertyId, room.unitTypeId, existing.checkIn, existing.checkOut);
      await logEvent({ kind: "CHANNEX", level: "INFO", propertyId: cp.propertyId, message: `Anulowano rezerwację OTA ${existing.code}`, meta: b.channel });
    }
    return;
  }

  const units = await prisma.unit.findMany({ where: { unitTypeId: room.unitTypeId, active: true }, select: { id: true }, orderBy: { id: "asc" } });
  const overlapping = await prisma.reservation.findMany({
    where: { unit: { unitTypeId: room.unitTypeId }, status: { in: ["CONFIRMED", "PENDING"] },
      checkIn: { lt: b.departure }, checkOut: { gt: b.arrival }, ...(existing ? { id: { not: existing.id } } : {}) },
    select: { unitId: true, checkIn: true, checkOut: true },
  });
  let unitId = pickFreeUnit(units, overlapping, b.arrival, b.departure);
  let conflict = false;
  if (unitId === null) { unitId = units[0]?.id ?? null; conflict = true; }
  if (unitId === null) {
    await logEvent({ kind: "CHANNEX", level: "ERROR", propertyId: cp.propertyId, message: "Rezerwacja OTA — typ pokoju bez aktywnych jednostek", meta: b.channexBookingId });
    return;
  }

  const data = {
    unitId, checkIn: b.arrival, checkOut: b.departure, guests: b.guests,
    guestName: b.guestName, email: b.email, phone: b.phone,
    totalGr: b.totalGr, depositGr: 0, status: "CONFIRMED", source: b.channel,
    channexBookingId: b.channexBookingId, otaCommissionGr: b.commissionGr, expiresAt: null,
  };
  if (existing) {
    await prisma.reservation.update({ where: { id: existing.id }, data });
  } else {
    await prisma.reservation.create({ data: { ...data, code: newCode() } });
  }
  await afterAri(cp.propertyId, room.unitTypeId, b.arrival, b.departure);
  await logEvent({
    kind: "CHANNEX", level: conflict ? "ERROR" : "INFO", propertyId: cp.propertyId,
    message: conflict ? `Rezerwacja OTA z KONFLIKTEM (brak wolnej jednostki) — ${b.channel}` : `Nowa rezerwacja OTA — ${b.channel}`,
    meta: b.channexBookingId,
  });
}
```
- [ ] **Step 4: PASS** (test pickFreeUnit). Test `ingestBooking` z `TEST_DATABASE_URL` (seed obiektu+mapowania) — opcjonalny.
- [ ] **Step 5: Commit** `Feat: Channex - ingest rezerwacji OTA (auto-assign, upsert, konflikty)`.

---

### Task 3: Endpoint webhooka + rejestracja + weryfikacja sekretu

**Files:** Create: `app/api/channex/webhook/route.ts`; Modify: `lib/channex/client.ts` (rejestracja webhooka w provisioningu)

**Interfaces:** `POST /api/channex/webhook` — weryfikacja `X-Channex-Webhook-Secret` (`safeEqual` z `CHANNEX_WEBHOOK_SECRET`), szybkie `200`, w `after()`: dla eventu bookingowego `getBooking` → `ingestBooking`. Rejestracja webhooka podczas provisioningu: `POST /webhooks` z `callback_url = ${appUrl()}/api/channex/webhook`, `event_mask: "booking"`, `headers: { "X-Channex-Webhook-Secret": secret }`, `is_active:true`, `send_data:true`.

- [ ] **Step 1:** `app/api/channex/webhook/route.ts`:
```ts
import { after } from "next/server";
import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { safeEqual } from "@/lib/password";
import { channelProvider } from "@/lib/channex/provider";
import { ingestBooking } from "@/lib/channex/ingest";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const secret = await getSetting("CHANNEX_WEBHOOK_SECRET");
  const got = req.headers.get("x-channex-webhook-secret") ?? "";
  if (!secret || !safeEqual(got, secret)) return new NextResponse("Unauthorized", { status: 401 });

  let body: any = null;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: true }); }
  const bookingId = body?.payload?.booking_id;
  const channexPropertyId = body?.payload?.property_id ?? body?.property_id;
  if (body?.event?.startsWith("booking") && bookingId && channexPropertyId) {
    after(async () => {
      const provider = await channelProvider();
      const cp = await prisma.channexProperty.findFirst({ where: { channexId: channexPropertyId }, select: { apiKey: true } });
      if (!provider || !cp) return;
      const booking = await provider.getBooking(cp.apiKey, bookingId);
      if (booking) await ingestBooking(booking);
    });
  }
  return NextResponse.json({ ok: true });
}
```
- [ ] **Step 2:** Rejestracja webhooka w `ChannexClient.provisionProperty` (na końcu, po utworzeniu property) — dodać metodę `registerWebhook(channexPropertyId, callbackUrl, secret)` i wołać z `provisionForProperty` (przekazać `${appUrl()}/api/channex/webhook` i `getSetting("CHANNEX_WEBHOOK_SECRET")`):
```ts
async registerWebhook(channexPropertyId: string, callbackUrl: string, secret: string): Promise<void> {
  await this.request("POST", "/webhooks", {
    webhook: { property_id: channexPropertyId, callback_url: callbackUrl, event_mask: "booking",
      headers: { "X-Channex-Webhook-Secret": secret }, is_active: true, send_data: true },
  });
}
```
(Dodać `registerWebhook` do interfejsu `ChannelProvider` + stub no-op.)
- [ ] **Step 3:** Weryfikacja: skonfigurować webhook w sandboxie ręcznie/przez provisioning; z panelu Channex sandbox wysłać testowy booking → sprawdzić, że w `/admin/rezerwacje` pojawia się rezerwacja CONFIRMED ze źródłem kanału, a w Logu synchronizacji wpis. Test podpisu: żądanie bez nagłówka → 401.
- [ ] **Step 4:** `npm run lint`, `npx vitest run` zielone.
- [ ] **Step 5:** Commit `Feat: Channex - webhook rezerwacji (weryfikacja sekretu, re-fetch, ingest)`.

---

### Task 4: Panel konfliktów OTA + oznaczenie źródła

**Files:** Modify: `app/admin/kanaly/page.tsx`, `app/admin/rezerwacje/page.tsx`, `lib/ical.ts` (rozszerzyć `findChannelConflicts` o rezerwacje OTA) lub nowy `lib/channex/conflicts.ts`

- [ ] **Step 1:** Konflikt OTA: rezerwacja z `channexBookingId` przypisana do Unitu, który ma inną nachodzącą rezerwację CONFIRMED. Funkcja `findOtaConflicts(propertyId)` (analogiczna do `findChannelConflicts`) — lista do panelu `/admin/kanaly`.
- [ ] **Step 2:** W liście rezerwacji (`/admin/rezerwacje`) kolumna „Kanał": dziś `source` MANUAL/ONLINE → dodać etykiety `BOOKING/AIRBNB/EXPEDIA` (badge z nazwą kanału). Reużyć istniejącej komórki „Kanał".
- [ ] **Step 3:** Panel „Rezerwacje OTA z konfliktem" w `/admin/kanaly` (tryb CHANNEX) — lista z `findOtaConflicts`, link do rezerwacji, sugestia „przenieś/anuluj".
- [ ] **Step 4:** Weryfikacja: wymusić oversell na sandboxie (dwie rezerwacje na ten sam termin/typ przy 1 jednostce) → konflikt widoczny. `npm run lint`.
- [ ] **Step 5:** Commit `Feat: Channex - panel konfliktow OTA i oznaczenie kanalu`.

---

## Self-review (Plan C)
- Pokrycie: getBooking+mapper (T1), ingest/auto-assign/idempotencja/oversell (T2), endpoint webhooka+rejestracja+sekret (T3), konflikty+źródło (T4). Zgodne ze spec (autorytatywny re-fetch, idempotencja `channexBookingId`, oversell→konflikt, brak auto-maili).
- `registerWebhook` dodany do interfejsu (rewizja wsteczna: stub no-op).
- Payloady zgodne z docs (`data.attributes`, webhook `payload.booking_id`).
