# Channex — Plan D: Łatwe podłączanie kanałów (Airbnb, Booking.com) — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Podłączanie kanałów OTA z panelu: Airbnb przez OAuth (niemal jeden klik), Booking.com przez prowadzony kreator (Hotel ID → połączenie → auto-mapowanie), z widocznym statusem połączenia.

**Wymaga:** Planów A–C (klient Channex, provisioning, `ChannexProperty/Room`, webhooki).

**Uwaga o API:** dokładne kształty payloadu połączeń kanałów w Channex są **specyficzne per-OTA i wersja API** — w Task 1 potwierdzamy je na żywym sandboxie (schema endpointu `/channels`), zanim wypełnimy metody klienta. To integracja z zewnętrznym API, więc weryfikacja żywej schemy jest częścią planu, nie placeholderem. Znany wzorzec: `POST /api/v1/channels` z `property_id`, typem kanału i `settings` (dane dostępowe + mapowanie `channex room_type_id/rate_plan_id ↔ kod pokoju/ceny OTA`); status połączenia z `GET /channels/:id`.

## Global Constraints

Jak w Planach A–C. Dodatkowo:
- Sekrety OAuth (Airbnb client id/secret po stronie Channex/konta) nie trafiają do klienta ani repo.
- Każde żądanie do OTA-connect wymaga `requireOwner` + gating PRO + skonfigurowanego Channex + statusu obiektu `ACTIVE`.

---

### Task 1: Model kanałów + potwierdzenie schemy `/channels` na sandboxie

**Files:** Modify: `prisma/schema.prisma`; Create: `docs/channex-channel-schema.md` (notatka z żywej schemy)

**Interfaces (Produces):**
- Model `ChannexChannel { id, propertyId, type String, channexChannelId String @default(""), status String @default("NONE"), lastError String @default(""), createdAt, @@unique([propertyId, type]) }` (`type`: `BOOKING | AIRBNB | EXPEDIA | OTHER`; `status`: `NONE | PENDING | CONNECTED | ERROR`).

- [ ] **Step 1:** Dodać model `ChannexChannel` do schematu; `npx prisma db push --skip-generate && npx prisma generate`.
- [ ] **Step 2:** Na sandboxie (klucz z `.env`) pobrać schemę połączeń: `GET /api/v1/channels` i (jeśli jest) endpoint schemy kanału Booking.com/Airbnb; zapisać do `docs/channex-channel-schema.md` **dokładne** nazwy pól `settings` dla Booking.com (np. `property_id`/`hotel_id`, mapowanie) i sposób inicjacji OAuth Airbnb (URL autoryzacji / hosted connect). Skrypt tsx `scratch` wołający `GET /channels` (usunąć po spisaniu).
- [ ] **Step 3:** Commit `Feat: Channex - model ChannexChannel + notatka schemy kanalow`.

---

### Task 2: Metody providera do kanałów (na bazie potwierdzonej schemy)

**Files:** Modify: `lib/channex/provider.ts` (interfejs + stub), `lib/channex/client.ts`

**Interfaces (Produces) — dodać do `ChannelProvider`:**
```ts
connectBooking(channexPropertyId: string, hotelId: string, mapping: { roomTypeId: string; ratePlanId: string }[]): Promise<{ channelId: string; status: string }>;
startAirbnbOAuth(channexPropertyId: string, redirectUrl: string): Promise<{ authUrl: string }>;
finishAirbnbOAuth(channexPropertyId: string, code: string): Promise<{ channelId: string; status: string }>;
channelStatus(channelId: string): Promise<{ status: string; message: string }>;
```
Implementacja `ChannexClient` wypełnia je zgodnie z `docs/channex-channel-schema.md` (Task 1) — `POST /channels` dla Bookinga (z `settings` zawierającym `hotel_id` i `mappings`), inicjacja/finalizacja OAuth Airbnb wg żywej schemy, `GET /channels/:id` dla statusu. Stub: `connectBooking`→`{channelId:"stub",status:"connected"}`, `startAirbnbOAuth`→`{authUrl:"/admin/kanaly?airbnb=stub"}`, `finishAirbnbOAuth`→`{channelId:"stub",status:"connected"}`, `channelStatus`→`{status:"connected",message:""}`.

- [ ] **Step 1:** Rozszerzyć interfejs + stub (no-op/deterministyczne wartości powyżej). Test stubu (`provider.test.ts`): `connectBooking`/`finishAirbnbOAuth` zwracają `status:"connected"`.
- [ ] **Step 2:** FAIL → implementacja w kliencie wg schemy z Task 1 → PASS (test stubu; realne wywołania weryfikowane na sandboxie w kolejnych taskach).
- [ ] **Step 3:** Commit `Feat: Channex - metody providera do polaczen kanalow`.

---

### Task 3: Booking.com — prowadzony kreator (Hotel ID → połączenie → auto-mapowanie)

**Files:** Create: `lib/channex/channel-actions.ts` ("use server"), `components/admin/channels/BookingConnect.tsx` (client)

**Interfaces:** `connectBookingChannel(formData)` — `requireOwner` + gating; pobiera `ChannexProperty`(ACTIVE) i `ChannexRoom[]` obiektu → buduje `mapping` z par `(channexRoomTypeId, channexRatePlanId)`; woła `provider.connectBooking(cp.channexId, hotelId, mapping)`; upsert `ChannexChannel(type:"BOOKING", channexChannelId, status)`; log `CHANNEX`; `redirect(?saved=1)`. `refreshBookingStatus()` — `provider.channelStatus` → update statusu.

- [ ] **Step 1:** Akcja `connectBookingChannel` + `refreshBookingStatus` wg wzorca (redirect/toast). Walidacja `hotelId` (niepusty, cyfry).
- [ ] **Step 2:** `BookingConnect.tsx` — kroki: (1) pole „Hotel ID z Booking.com" + „Podłącz"; (2) status na żywo (Oczekuje na akceptację → Podłączony) + instrukcja „zaakceptuj połączenie w extranecie Booking.com" (krok po stronie OTA); (3) po `CONNECTED` — komunikat o auto-mapowaniu pokoi. Przyciski: „Podłącz", „Odśwież status".
- [ ] **Step 3:** Weryfikacja na sandboxie: wpisanie testowego Hotel ID → utworzenie kanału w Channex, status `PENDING/CONNECTED`, wpis w Logu synchronizacji.
- [ ] **Step 4:** `npm run lint`. Commit `Feat: Channex - kreator Booking.com (Hotel ID + mapowanie)`.

---

### Task 4: Airbnb — OAuth (start + callback)

**Files:** Create: `app/api/channex/airbnb/start/route.ts`, `app/api/channex/airbnb/callback/route.ts`, `components/admin/channels/AirbnbConnect.tsx`; Modify: `lib/channex/channel-actions.ts`

**Interfaces:** 
- `GET /api/channex/airbnb/start?propertyId=…` — `requireOwner` (przez sesję), gating; `provider.startAirbnbOAuth(cp.channexId, ${appUrl()}/api/channex/airbnb/callback)` → `redirect(authUrl)`.
- `GET /api/channex/airbnb/callback?code=…&state=…` — waliduje `state` (podpisany, zawiera propertyId), `provider.finishAirbnbOAuth(cp.channexId, code)` → upsert `ChannexChannel(type:"AIRBNB", status)`; redirect `/admin/kanaly?saved=1`.

- [ ] **Step 1:** `state` = podpisany token (HMAC z `CHANNEX_WEBHOOK_SECRET` lub dedykowany sekret) z `propertyId` + timestamp; helper `signState/verifyState` w `lib/channex/oauth-state.ts` + test czysty (round-trip, odrzucenie zmanipulowanego).
- [ ] **Step 2:** Route'y start/callback wg powyższego; `AirbnbConnect.tsx` — przycisk „Podłącz Airbnb" (link do `/api/channex/airbnb/start?propertyId=…`) + status.
- [ ] **Step 3:** Weryfikacja: przepływ OAuth na sandboxie (lub stub `CHANNEX_STUB=1` → callback od razu „connected"); po powrocie kanał `AIRBNB` = `CONNECTED`, wpis w logu.
- [ ] **Step 4:** `npm run lint`, `npx vitest run` (test `oauth-state`). Commit `Feat: Channex - podlaczenie Airbnb przez OAuth`.

---

### Task 5: Kafle kanałów w panelu + fallback + testy

**Files:** Modify: `app/admin/kanaly/page.tsx`; Create: `components/admin/channels/ChannelTiles.tsx`

- [ ] **Step 1:** `ChannelTiles.tsx` — kafle per kanał (Booking.com, Airbnb, „Inne kanały") ze statusem z `ChannexChannel` (Niepodłączony/Oczekuje/Podłączony/Błąd) i przyciskiem „Podłącz"/„Zarządzaj"/„Odśwież"; Booking→`BookingConnect`, Airbnb→`AirbnbConnect`, „Inne" → link do hostowanego kreatora Channex (fallback).
- [ ] **Step 2:** Wpiąć kafle w `/admin/kanaly` (tryb CHANNEX, status ACTIVE); gdy status obiektu ≠ ACTIVE — komunikat „najpierw dokończ konfigurację Channex".
- [ ] **Step 3:** e2e (stub, `CHANNEX_STUB=1`): PRO → tryb Channex → kafle widoczne; „Podłącz Airbnb" (stub) → status Podłączony; „Podłącz Booking" z Hotel ID (stub) → status Podłączony. `tests/e2e/channex-connect.spec.ts`.
- [ ] **Step 4:** Dokumentacja: `docs/FUNKCJE.md` — sekcja o podłączaniu Booking/Airbnb z panelu; `README.md` — wzmianka. `npm run lint`, `npx vitest run`, e2e zielone.
- [ ] **Step 5:** Commit `Feat: Channex - kafle kanalow (Booking/Airbnb/fallback) + e2e`.

---

## Self-review (Plan D)
- Pokrycie spec: łatwe podłączanie Booking (kreator+Hotel ID+mapowanie) i Airbnb (OAuth), status per kanał, fallback do kreatora Channex, gating PRO. Model `ChannexChannel` śledzi połączenia.
- Uczciwość o API: dokładne kształty `/channels` potwierdzane w Task 1 na żywym sandboxie i spisane do `docs/channex-channel-schema.md`, zanim wypełnione zostaną metody klienta — to jedyny obszar zależny od żywej schemy, świadomie oznaczony.
- Spójność: metody providera (Task 2) użyte w akcjach/route'ach (T3/T4); `ChannexChannel` (T1) w akcjach i kaflach (T3–T5); stub deterministyczny umożliwia testy i e2e bez realnego OTA.
