# Dwukierunkowa synchronizacja z channel managerem Channex

Data: 2026-07-24 · Status: zaakceptowany przez właściciela projektu

## Cel

Umożliwić obiektom sprzedaż przez OTA (Booking.com, Airbnb, Expedia…) bez podwójnych
rezerwacji i bez ręcznego przepisywania kalendarzy — przez pełną, dwukierunkową
integrację z channel managerem **Channex**. RezOp jest źródłem prawdy dostępności:
pushuje ARI (dostępność, restrykcje) do Channex, a rezerwacje z OTA wracają webhookiem.
Integracja uzupełnia/zastępuje obecny jednokierunkowy iCal i daje właścicielowi łatwe
podłączanie kanałów z panelu oraz log synchronizacji.

## Decyzje kluczowe (ustalone z właścicielem)

1. **Model konta: RezOp zarządza** — jedno konto biznesowe RezOp w Channex; każdy obiekt
   provisionowany przez API pod tym kontem. Właściciel nie widzi Channex — wszystko w panelu.
2. **Mapowanie: UnitType → Room Type** — dostępność = liczba wolnych Unitów danego typu;
   rezerwacja z OTA auto-przypisywana do konkretnego wolnego Unitu.
3. **Zakres MVP: dostępność + rezerwacje** — mapowanie, push dostępności i restrykcji
   (min. pobyt, stop-sell), odbiór rezerwacji z OTA. Push cen — poza MVP.
4. **Tryb synchronizacji przełączany** (`OFF / ICAL / CHANNEX`) na poziomie obiektu; Channex
   zastępuje iCal dla swoich kanałów, iCal zostaje dla pozostałych. Channex tylko w planie **PRO**.
5. **Łatwe podłączanie z panelu** — wbudowany connect dla **Booking.com** (kreator + Hotel ID)
   i **Airbnb** (OAuth, niemal jeden klik); pozostałe OTA przez kreator Channex jako fallback.
6. **Log synchronizacji** — panel w `/admin/kanaly` + wpisy w `EventLog` (`kind: CHANNEX`).

## Architektura

RezOp ↔ Channex (hub) ↔ OTA. Nie komunikujemy się z OTA bezpośrednio — Channex trzyma
certyfikowane połączenia. Nowy moduł `lib/channex/`:

- `client.ts` — cienki klient REST Channex (auth kluczem konta RezOp, retry/timeout, mapowanie
  błędów) za abstrakcją `ChannelProvider` (furtka na innego CM, jak `DomainProvider`).
- `mapping.ts` — provisioning: obiekt → Channex Property; `UnitType` → Room Type + Rate Plan.
- `ari.ts` — liczenie i push dostępności/restrykcji.
- `bookings.ts` — mapowanie webhooka Channex → `Reservation` + auto-assign Unitu.
- `outbox.ts` — worker przetwarzający `AriOutbox`.

### Abstrakcja providera

`ChannelProvider`: `provisionProperty / pushAri / getBooking / connectChannel / channelStatus`.
Implementacja Channex + **stub** do dev/testów. `channelProvider()` = `null` gdy brak
konfiguracji → segment „Channex" w przełączniku ukryty (wzorzec jak P24/Vercel). Testy
chodzą bez realnego Channex.

## Model danych (zmiany schematu)

- `Property.syncMode` — `OFF | ICAL | CHANNEX`, `@default("ICAL")`. Migracja istniejących
  obiektów: wszystkie dostają `ICAL` (tryb tożsamy z dzisiejszym zachowaniem — bez feedów
  po prostu nic się nie importuje, więc jest bezpieczny jako default).
- `ChannexProperty` (1:1 z `Property`): `channexId`, `apiKey`, `status` (`NONE/PENDING/ACTIVE/PAUSED/ERROR`),
  `lastError`, `syncedAt`.
- `ChannexRoom` (1:1 z `UnitType`): `channexRoomTypeId`, `channexRatePlanId`.
- `AriOutbox`: `propertyId`, `unitTypeId`, `dateFrom`, `dateTo`, `status` (`PENDING/SENT/ERROR`),
  `attempts`, `lastError`, `createdAt`, `updatedAt`. Wzorzec outbox — akcje tylko zapisują zadanie.
- `Reservation`: `source` dochodzą wartości `BOOKING | AIRBNB | EXPEDIA | CHANNEX_OTHER`
  (dziś `ONLINE/MANUAL`); nowe `channexBookingId String? @unique` (idempotencja) i
  `otaCommissionGr Int @default(0)`.

### Współistnienie z iCal

Przełącznik `syncMode` per obiekt. W `CHANNEX` import/eksport iCal wyłączony dla obiektu
(feedy zostają zapisane, nieaktywne — powrót do `ICAL` niczego nie traci). Rozstrzyga konflikt
„ten sam Booking przez iCal i przez Channex".

## Outbound ARI (push dostępności i restrykcji)

**Wyzwalacze** (zapis zadania do `AriOutbox`, zakres dób):
- rezerwacja utworzona/potwierdzona/anulowana/zmiana terminu (bezpośrednia, ręczna, z OTA),
- blokada MANUAL dodana/usunięta,
- Unit włączony/wyłączony (zmiana liczby jednostek) → pełne okno,
- zmiana `UnitType.minStay` lub `RateSeason.minStay` → pełne okno typu.

**Worker:**
- near-real-time: po zapisie `after(() => processOutbox(propertyId))` — best-effort, poza ścieżką odpowiedzi;
- siatka bezpieczeństwa: cron dorzuca zawieszone `PENDING/ERROR` (retry z backoffem, `ERROR` po N próbach + log);
- sklejanie nachodzących zakresów tego samego typu w jeden zapis do API.

**Liczenie dostępności** (per UnitType, per doba, reużywa `lib/availability`):
`wolne = liczba aktywnych Unitów typu − Unity zajęte w dobie` (zajęte = CONFIRMED lub ważny
PENDING lub blokada MANUAL nachodząca na `[doba, doba+1)`). Trafia jako `availability` Room Type'u;
`0` = naturalny stop-sell.

**Restrykcje (MVP):** `min_stay_arrival` = `RateSeason.minStay` dla doby, w braku sezonu `UnitType.minStay`;
na Rate Plan. `closed_to_arrival/departure` — poza MVP.

**Okno i idempotencja:** kroczące `dziś .. +18 mies.`; push wysyła wartości bezwzględne (nie delty) →
ponowne przetworzenie bezpieczne. Codzienny pełny re-sync (cron) jako samonaprawa.

## Inbound (rezerwacja z OTA → RezOp)

**Endpoint** `/api/channex/webhook` (booking utworzony/zmieniony/anulowany):
- **Bezpieczeństwo:** po odebraniu powiadomienia **dociągamy pełną rezerwację z API Channex** po ID
  (autorytatywne źródło — podrobiony webhook nic nie wstrzyknie) + weryfikacja sekretu/podpisu;
  szybkie `200`, przetwarzanie w `after()`.
- **Idempotencja:** `Reservation.channexBookingId` unikalny → upsert; pole rewizji ignoruje spóźnione zdarzenia.

**Mapowanie booking → `Reservation`:** obiekt (property id → `ChannexProperty`), typ
(room type id → `ChannexRoom`), daty/goście/gość, `totalGr` z OTA, `otaCommissionGr`,
`depositGr=0`, status **CONFIRMED**, `source` = kanał, własny kod `HO-…`.

**Auto-assign Unitu:** pierwszy wolny aktywny Unit typu na zakres; **brak wolnego** (oversell) →
rezerwacji **nie odrzucamy**, tworzymy i oznaczamy konflikt (log `CHANNEX ERROR` + panel konfliktów).

**Modyfikacje/anulowania:** update po `channexBookingId` (re-assign gdy zmiana dat); anulowanie →
`CANCELLED`. Każda zmiana dorzuca zadanie ARI (spójność pozostałych kanałów).

**Powiadomienia:** dla rezerwacji z OTA **nie wysyłamy automatycznie** e-maili/SMS/meldunku
(szanujemy zasady kanału i aliasy e-mail); właściciel może wysłać zaproszenie ręcznie.

## Onboarding, mapowanie, podłączanie kanałów

**Provisioning (automatyczny):** przełączenie na `CHANNEX` (PRO) tworzy w tle Property +
Room Type + Rate Plan (obłożenie = `maxGuests`, liczba = liczba aktywnych Unitów), waluta PLN,
godziny doby z `Property`; zapis ID-ków; pełny push ARI. Status `PENDING→ACTIVE`.

**Podłączanie kanałów — w panelu, per kanał:**
- **Airbnb:** „Podłącz Airbnb" → OAuth → Channex tworzy połączenie → auto-mapowanie Room Type'ów;
  właściciel potwierdza.
- **Booking.com:** kreator — właściciel podaje **Hotel ID**, tworzymy połączenie przez Channex
  Channel API, status na żywo (Oczekuje na akceptację → Podłączony) z instrukcją kroków w extranecie
  (akceptacja po stronie OTA nieunikniona), potem auto-mapowanie pokoi/cen z korektą.
- **Pozostałe OTA:** ten sam wzorzec; rzadsze — fallback do hostowanego kreatora Channex.

**Panel `/admin/kanaly` (tryb Channex):** kafle kanałów ze statusem (Niepodłączony/Oczekuje/
Podłączony/Błąd) + „Podłącz"/„Zarządzaj"; status Room Type'ów; panel konfliktów; **Log synchronizacji**;
„Wymuś pełną synchronizację". Przełącznik segmentowy `Bez synchronizacji / iCal / Channex`.

**Gating:** `CHANNEX` tylko PRO (w STANDARD wyszarzone z upsellem); iCal od STANDARD.

**Powrót do iCal:** wstrzymanie pushu (mapowanie `PAUSED`, ponowne włączenie natychmiastowe),
feedy iCal reaktywują się; UI radzi rozłączyć kanały w Channex, by OTA nie trzymały stałej dostępności.

**Wymóg biznesowy (spoza kodu):** konto RezOp w Channex musi mieć certyfikowane połączenia
Booking.com i Airbnb — dostarcza Channex jako partner connectivity.

## Log synchronizacji

- Techniczne zdarzenia → `EventLog` (`kind: CHANNEX` obok `ICAL`), widoczne też w superadminie.
- Panel „Log synchronizacji" w `/admin/kanaly`: chronologia zdarzeń obiektu (push OK/błąd+powód,
  import rezerwacji z OTA — kanał + kod, zmiany mapowania, przełączenia trybu), zasilany z
  `EventLog` (`propertyId`, `kind IN (ICAL, CHANNEX)`) + statusy `AriOutbox`. Wpis: czas, kanał/zakres,
  status, komunikat.

## Konfiguracja i sekrety

Brak konfiguracji = tryb Channex ukryty.
- Platformowe (przez `lib/settings`, maskowane w superadminie): `CHANNEX_BASE_URL`,
  `CHANNEX_API_KEY`, `CHANNEX_WEBHOOK_SECRET`; OAuth Airbnb po stronie Channex/naszego client-id.
- Per-obiekt: `ChannexProperty.apiKey`, `channexId` — wyłącznie serwerowo.

## Obsługa błędów

- Outbound: outbox z backoffem, `ERROR` po N próbach → log + panel; codzienny pełny re-sync.
- Inbound: webhook zawsze szybkie `200`, `after()`, autorytatywny re-fetch, idempotencja, oversell → konflikt.
- Provisioning/connect: `status ERROR` + `lastError` w panelu z przyciskiem ponów.
- Channex niedostępny → akcje użytkownika przechodzą (outbox), UI: „oczekuje na synchronizację".

## Testy

- vitest (mock klienta): wolne Unity per doba, builder payloadu ARI, sklejanie zakresów,
  mapowanie webhook→`Reservation`, wybór Unitu, idempotencja, `minStay` (sezon vs typ).
- integracyjne: endpoint webhooka na przykładowym payloadzie → tworzy rezerwację; weryfikacja sekretu.
- e2e (stub providera): przełączanie `syncMode`, render Logu synchronizacji i konfliktów, gating PRO.

## Poza MVP (kolejne etapy)

Push cen z cennika/cen dynamicznych na OTA; `closed_to_arrival/departure`; wbudowany connect
pozostałych OTA (poza fallbackiem); synchronizacja opinii/wiadomości OTA; wielowalutowość;
granularność `syncMode` per UnitType.

## Kryteria sukcesu

- Brak podwójnych rezerwacji między kanałem bezpośrednim a OTA (stop-sell działa w czasie ~minut).
- Podłączenie Airbnb: < 2 min, bez opuszczania panelu (poza autoryzacją OAuth).
- Podłączenie Booking.com: prowadzone, minimum ręcznych kroków (Hotel ID + akceptacja w extranecie).
- Rezerwacja z OTA pojawia się w panelu jako CONFIRMED z przypisanym Unitem (lub konfliktem) < 1 min od webhooka.
