# Wydarzenia jako sygnał popytu (Ticketmaster Discovery API)

## Po co

Do planu 9 popyt liczył się wyłącznie z kalendarza: święta, długie weekendy,
mostki, ferie per województwo. Ten model ma dziurę widoczną w wagach:

```
[MarketType.CityBusiness] = new(Holiday: -8, LongWeekend: -10, Bridge: -5, ...)
```

Miasta biznesowe mają **same ujemne** wagi kalendarzowe — w święta pustoszeją,
a nic ich nie zapełnia. Realnie zapełniają je wydarzenia: koncerty, mecze,
targi. Wydarzenia nie są więc ozdobnikiem modelu, tylko jedynym dodatnim
driverem dla całej ćwiartki rynków.

## Przepływ

Identyczny jak przy statystykach rynku — serwis zewnętrzny zna świat, monolit
trzyma dane i liczy:

```
POST /v1/event-jobs {market_id, from, to}          → scraper-api (:8082)
    ├─ GET /v1/markets (z monolitu)  ← pozycja rynku, bez duplikowania markets.json
    ├─ TicketmasterEventSource       ← Discovery API v2, geoPoint + radius 30 km
    ├─ EventCollector                ← filtr kategorii, dedup, skala per doba
    └─ POST /v1/internal/events      → monolit zapisuje do tabeli market_events

POST /v1/quote → QuoteService czyta wydarzenia doby → DemandScoreCalculator
```

## Skala wydarzenia — świadome ograniczenie

Discovery API **nie podaje pojemności obiektu ani frekwencji**. Zamiast zmyślać
magnitudę, bierzemy sygnał, który faktycznie widać: liczbę kwalifikujących się
wydarzeń w rynku danego dnia.

| Liczba wydarzeń w dobie | Skala |
|---|---|
| 1 | `Small` |
| 2–4 | `Medium` |
| ≥5 | `Large` |

Noc z pięcioma koncertami realnie zapełnia miasto bardziej niż noc z jednym.
**Ale**: pojedynczy festiwal na 30 tys. osób wygląda tu tak samo jak jeden
klubowy koncert. Naprawi to dopiero źródło z pojemnością obiektu albo osobny
wykaz dużych imprez. Dlatego `EventCollector` emituje **jeden sygnał na dobę**,
a nie po jednym na wydarzenie — żeby nie mnożyć błędu przez liczbę pozycji.

Kategorie brane pod uwagę: `Music`, `Sports`, `Arts & Theatre`. Reszta (kino,
`Miscellaneous`) nie generuje noclegów i jest odrzucana.

## Jak wydarzenia wchodzą do wyniku

W przeciwieństwie do sygnałów kalendarzowych, które **nie sumują się** (priorytet
długi weekend > mostek > święto > przeddzień), wydarzenia **dokładają się na
wierzchu** — festiwal w długi weekend to realnie więcej popytu niż każde
z osobna. Chroni je własny sufit per typ rynku (`EventCap`), żeby jedno źle
oszacowane wydarzenie nie przybiło score'u do 100 i nie wywindowało ceny do
`max_price`.

| Typ rynku | Small | Medium | Large | Sufit |
|---|---|---|---|---|
| Góry | 3 | 8 | 15 | 20 |
| Morze | 4 | 10 | 18 | 22 |
| Miasto turystyczne | 5 | 12 | 20 | 25 |
| Miasto biznesowe | 5 | 12 | 22 | 30 |

Nazwy wydarzeń trafiają do `demand_drivers`, więc właściciel widzi w panelu
RezFlow, że cena wzrosła „bo koncert", a nie bez powodu.

## Konfiguracja

`TICKETMASTER_API_KEY` na serwisie scrapera. Discovery API to **oficjalne API
z kluczem, nie scrapowanie** — bez łamania regulaminu i bez walki z anti-botem.
Limity dostawcy: 5000 wywołań na dobę, 5 na sekundę, stronicowanie do 1000
pozycji (`size * page < 1000`). Przy 89 rynkach pełne odświeżenie mieści się
w dobowej puli z dużym zapasem.

**Bez klucza nie ma zastępczego źródła i to jest celowe.** Zmyślone wydarzenia
ruszyłyby prawdziwe ceny — brak danych jest bezpieczniejszy niż dane fikcyjne.
`/v1/event-jobs` zwraca wtedy 503, a popyt liczy się z samego kalendarza.

## Świeżość

Wpisy starsze niż **30 dni** przestają być zwracane (`EventFreshness.Window`) —
dłużej niż 7-dniowe okno statystyk rynku, bo kalendarz wydarzeń publikowany
jest z wyprzedzeniem i sprzed miesiąca wciąż jest w większości prawdziwy.
Wydarzenia leżą w osobnej tabeli `market_events`, nie w kolumnie `market_data`:
źródła są niezależne, mają inne okno świeżości i nie powinny konkurować o ten
sam wiersz przy zapisie.

## Kluczowe klasy

`EventSignal`, `EventScale`, `DemandWeights` (moduł demand) ·
`IEventSource`, `SourceEvent`, `EventCollector`, `Geohash` (domena scrapera) ·
`TicketmasterEventSource`, `EventsAndPublish` (host scrapera) ·
`IEventStore`, `InMemoryEventStore`, `EfEventStore`, `EventRecord` (monolit).
