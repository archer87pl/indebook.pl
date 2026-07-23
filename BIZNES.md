# Rezio — dokument biznesowy

> System rezerwacji dla obiektów noclegowych, który sprzedaje **abonament zamiast prowizji**.
> Dokument opisuje stan produktu, pozycjonowanie rynkowe, model biznesowy i kierunki rozwoju.
> Stan na: lipiec 2026 · domena: **rezio.pl**

---

## 1. Streszczenie (TL;DR)

Rezio to wielotenantowa platforma SaaS dla małych i średnich obiektów noclegowych w Polsce (pensjonaty, wille, apartamenty, domki). Zamiast pobierać 15–25% prowizji jak Booking.com czy Airbnb, Rezio bierze **stały miesięczny abonament (0 / 79 / 149 zł)**, a wszystkie rezerwacje z własnej strony obiektu są bez prowizji.

Produkt jest kompletnym „systemem recepcji w chmurze": od silnika rezerwacji na stronie obiektu, przez płatności online, channel manager, meldunek online z e-podpisem, komunikację z gościem (czat + SMS), ceny dynamiczne, opinie, aż po faktury. Poziomem funkcji dorównuje polskiemu liderowi (HOTRES), a w kilku obszarach (opinie z gwiazdkami w Google, prostota wdrożenia) go wyprzedza.

**Główna oś sprzedaży:** *„Twoi goście. Twoje rezerwacje. Zero prowizji."* — obiekt odzyskuje dane gościa, markę i marżę, którą dziś oddaje pośrednikom.

---

## 2. Problem i rynek

### Problem właściciela obiektu
- **Prowizje OTA zjadają marżę.** Przy 100 000 zł rocznego obrotu portale zabierają 15–25 tys. zł. Dla małego obiektu to różnica między zyskiem a stratą.
- **Gość „należy" do portalu.** Booking ukrywa e-mail gościa (`guest123@booking.com`), obiekt nie może budować relacji ani sprzedawać bezpośrednio.
- **Chaos operacyjny.** Kalendarz w zeszycie, potwierdzenia przez SMS, podwójne rezerwacje między telefonem a Bookingiem, meldunek na papierze, faktury ręcznie w Wordzie.
- **Brak własnej sprzedaży.** Mały obiekt rzadko ma stronę z realną rezerwacją online — traci gości, którzy chcieliby rezerwować bezpośrednio.

### Rynek docelowy (segment)
- Pensjonaty, wille, apartamenty na wynajem krótkoterminowy, domki, gospodarstwa agroturystyczne.
- **3–30 jednostek** (pokoi/apartamentów) — za mali na enterprise'owe PMS-y, za duzi na zeszyt.
- Polska; właściciel-operator lub mała firma zarządzająca kilkoma obiektami.
- Wrażliwi na cenę, ceniący prostotę wdrożenia (samodzielna konfiguracja bez wdrożeniowca).

### Dlaczego teraz
- Rosnąca presja prowizji OTA i świadomość „direct booking".
- Obowiązek **KSeF** (Krajowy System e-Faktur) zmusza obiekty do cyfryzacji fakturowania.
- Dojrzałość taniej infrastruktury (Vercel, Supabase) pozwala oferować pełny PMS w niskim abonamencie.

---

## 3. Propozycja wartości

| Dla kogo | Wartość |
|---|---|
| **Właściciel** | 0% prowizji, własna marka i strona, dane gościa od pierwszej chwili, jeden panel zamiast pięciu narzędzi, wdrożenie w 30 minut bez wdrożeniowca. |
| **Gość** | Rezerwuje bezpośrednio u obiektu, samoobsługa (zmiana terminu, meldunek online, czat), instrukcje przyjazdu, płatność BLIK. |
| **Platforma (my)** | Powtarzalny przychód abonamentowy (MRR), niski koszt obsługi (self-service SaaS), efekt katalogu (obiekty na rezio.pl). |

**Pozycjonowanie jednym zdaniem:** *Rezio to recepcja w chmurze dla małych obiektów — pełnia funkcji dużego PMS-u w cenie abonamentu, bez prowizji od rezerwacji.*

---

## 4. Co system ma dziś (pełny inwentarz funkcji)

### 4.1 Sprzedaż i silnik rezerwacji
- **Strona obiektu** pod własnym adresem (`/o/[slug]`) z opisem, zdjęciami, udogodnieniami, FAQ.
- **Wyszukiwarka terminów** z cenami per noc i dostępnością w czasie rzeczywistym.
- **Cennik sezonowy** per typ pokoju, minimalna długość pobytu, ceny bazowe.
- **Kody promocyjne** (rabat %, limit użyć, termin ważności).
- **Ceny dynamiczne** — reguły automatycznie korygujące cenę nocy:
  - weekend (podwyżka pt/sob),
  - last minute (rabat na domykanie luk w najbliższych dniach),
  - wysokie obłożenie (podwyżka po przekroczeniu progu).
  Spójnie stosowane we wszystkich wycenach (wyszukiwarka, rezerwacja, zmiana terminu).
- **Rezerwacja wstępna** — 30 minut na wpłatę zaliczki, potem termin sam się zwalnia.

### 4.2 Płatności
- **Przelewy24** — BLIK, karty, szybkie przelewy; zaliczka potwierdza rezerwację automatycznie (webhook).
- **Konto P24 per obiekt** — właściciel podpina własną umowę z Przelewy24 w panelu (samoobsługowy onboarding z testem połączenia); zaliczki trafiają bezpośrednio na jego konto, prowizję bramki (~1%) rozlicza z P24. Platforma nie dotyka pieniędzy gości (brak ryzyka regulacyjnego MIP/KIP) i nie ponosi kosztu zmiennego bramki.
- Tryb symulacji dla dewelopmentu (bez konfiguracji bramki).
- Procent zaliczki konfigurowalny per obiekt.

### 4.3 Channel manager (kanały sprzedaży)
- **Import/eksport iCal** dwustronny z Booking.com, Airbnb, Vrbo (presety z instrukcjami).
- Automatyczna synchronizacja co godzinę + sync ręczny.
- **Wykrywanie podwójnych rezerwacji** (kanał × rezerwacja bezpośrednia) z alertem na pulpicie.
- Eksport nie zawiera terminów zaimportowanych z innych kanałów (ochrona przed pętlą).

### 4.4 Obsługa gościa (samoobsługa — wyróżnik produktu)
- **Panel gościa** `/r/[kod]`: status, samodzielna zmiana terminu/liczby osób (z przeliczeniem ceny), anulowanie.
- **Meldunek online / karta meldunkowa** `/r/[kod]/meldunek`: dane gościa, dodatkowi goście, nr auta, **e-podpis (canvas, palcem/myszką)**. Świadomie **bez skanów dokumentów** (minimalizacja danych, zgodność z RODO/UODO) — tylko typ i numer dokumentu, opcjonalnie.
- **Instrukcje przyjazdu** (kody do drzwi, WiFi, dojazd) odblokowywane dopiero **po wypełnieniu meldunku** — zachęta do zameldowania i samodzielne zameldowanie bez recepcji.
- **Czat gość ↔ obiekt** przypięty do rezerwacji, z powiadomieniami e-mail i badge'ami nieprzeczytanych.
- **Karta meldunkowa do druku** z podpisem w panelu obiektu; PII kasowane automatycznie 12 miesięcy po wymeldowaniu (retencja RODO).

### 4.5 Komunikacja automatyczna
- **E-maile** (Resend): potwierdzenia, zmiany terminu, anulowania, reset hasła.
- **SMS-y** (SMSAPI): potwierdzenie rezerwacji + przypomnienie dzień przed przyjazdem (wysyłka tylko 8–21, idempotentna).
- **Prośby o opinię** po pobycie (e-mail + SMS dzień po wymeldowaniu).

### 4.6 Opinie gości
- Ocena 1–5 gwiazdek + komentarz przez gościa (formularz z linku).
- **Moderacja** (ukryj/przywróć nadużycie) i **publiczna odpowiedź obiektu**.
- Publikacja na stronie obiektu + **`aggregateRating` (JSON-LD)** → gwiazdki w wynikach Google. To realna przewaga SEO, której HOTRES nie eksponuje.

### 4.7 Faktury
- **Faktura VAT / zaliczkowa / proforma** wystawiana jednym kliknięciem z rezerwacji.
- Numeracja kolejna per seria i rok (FV / FZ / PRO), rozbicie brutto → netto + VAT (8/23/5/0%).
- Snapshot danych sprzedawcy i nabywcy, widok do druku/PDF, rejestr faktur z sumą.
- Dane sprzedawcy (NIP, konto) konfigurowane w ustawieniach obiektu.

### 4.8 Panel recepcji (właściciel)
- **Pulpit**: przyjazdy/wyjazdy dziś, goście w obiekcie, oczekujące wpłaty, alerty (podwójne rezerwacje, nieprzeczytane wiadomości).
- **Rezerwacje**: lista z filtrami, rezerwacje ręczne, edycja, statusy.
- **Kalendarz** obłożenia + blokady ręczne.
- **Cennik**: sezony, kody promocyjne, reguły cen dynamicznych.
- **Pokoje**: typy i jednostki (z linkami iCal per jednostka).
- **Kanały, Faktury, Opinie, Raporty, Obiekt** (ustawienia, zdjęcia, FAQ, regulamin, dane do faktur, instrukcje przyjazdu).

### 4.9 Raporty i analityka
- Przychody i obłożenie **per kanał sprzedaży** (bezpośredni / ręczny / OTA) i per typ pokoju.
- KPI: przychód bezpośredni, obłożenie z kanałami, **ADR**, średnia długość pobytu.
- **Eksport CSV** (Excel-PL) do księgowości.

### 4.10 Panel platformy (superadmin)
- Statystyki: konta, obiekty, **MRR wg planów, GMV** (30 dni / od początku), rozkład planów.
- **Karta obiektu**: edycja danych obiektu i konta właściciela, reset hasła, **zawieszenie** (ukrycie z katalogu + blokada rezerwacji), **trwałe usunięcie** z potwierdzeniem.

### 4.11 Fundament
- **Wielotenantowość** z pełną izolacją danych per obiekt.
- **SEO**: JSON-LD (FAQ, SoftwareApplication z ofertami planów, Organization, aggregateRating), sitemap, robots.
- **Marka Rezio**: nowoczesny UX 2026 (elektryczny błękit + granat), responsywny, dynamiczny favicon.

---

## 5. Pozycjonowanie konkurencyjne

### 5.1 Rezio vs portale OTA (Booking.com, Airbnb)

| | Rezio | Portale OTA |
|---|---|---|
| Prowizja | **0 zł — stały abonament** | 15–25% każdej rezerwacji |
| Dane i kontakt do gościa | Twoje, od pierwszej chwili | ukryte za portalem |
| Marka i strona | Twoja własna strona | profil w cudzym serwisie |
| Meldunek | online, z e-podpisem | brak / papier |
| Opinie | na Twojej stronie i w Google | zostają na portalu |
| Faktura | jedno kliknięcie z rezerwacji | poza systemem |

> Rezio nie zastępuje OTA jako źródła ruchu — **współistnieje** z nimi (channel manager) i przejmuje rezerwacje bezpośrednie, które inaczej i tak trafiłyby przez portal z prowizją.

### 5.2 Rezio vs HOTRES (polski lider)

**Mamy na równi z HOTRES:** silnik rezerwacji bez prowizji, channel manager (u nas iCal), płatności, meldunek online z e-podpisem, czat z gościem, SMS-y, ceny dynamiczne, faktury, cennik sezonowy, kody promocyjne, raporty.

**Jesteśmy przed HOTRES:** opinie gości z moderacją i `aggregateRating` (gwiazdki w Google) — HOTRES nie oferuje tego jako modułu; prostota i szybkość wdrożenia self-service.

**HOTRES ma, my jeszcze nie:**

| Luka | Waga | Uwaga |
|---|---|---|
| Dwukierunkowy channel manager (API OTA real-time) | wysoka | wymaga certyfikacji partnerskiej Booking/Airbnb (miesiące) |
| Upselling (płatne dodatki w trakcie pobytu) | wysoka | lekkie, przychodowe |
| Vouchery / bony podarunkowe | średnia | dodatkowe źródło sprzedaży |
| Housekeeping (panel sprzątania) | średnia | operacyjne |
| KSeF (e-faktury) | wysoka | obowiązek prawny 2026 |
| Panel właściciela apartamentu (sub-konta) | średnia | segment firm zarządzających |
| Aplikacja mobilna (iOS/Android) | niska/średnia | mamy responsywny web |
| Więcej bramek (PayU, Tpay, Dotpay) | niska | łatwe |

**Poza zakresem (sprzęt/wertykale):** kiosk samoobsługowy, zamki elektroniczne, depozytory kluczy, POS gastronomia, catering — wymagają integracji sprzętowych, nie pasują do modelu lekkiego SaaS dla małych obiektów.

---

## 6. Model biznesowy

### 6.1 Źródło przychodu
**Abonament SaaS** (miesięczny), nie prowizja. Kluczowa obietnica marki: „płacisz za system, nie za sukces".

| Plan | Cena | Limit | Dla kogo |
|---|---|---|---|
| **Start** | 0 zł | 3 jednostki | mały obiekt zaczynający sprzedaż online |
| **Standard** | 79 zł/mc | 15 jednostek | pełny warsztat recepcji (channel manager, płatności, meldunek, czat, SMS) |
| **Pro** | 149 zł/mc | bez limitu | większe obiekty (ceny dynamiczne, faktury, raporty, wsparcie) |

- Plan **Start darmowy bezterminowo** = kanał akwizycji (freemium / land-and-expand).
- Upgrade napędzany limitem jednostek i funkcjami wyższych planów.

### 6.2 Metryki (śledzone w panelu superadmina)
- **MRR** (wg planów), **GMV** (wartość rezerwacji przechodzących przez system), liczba obiektów i kont, rozkład planów.
- Naturalne KPI do dołożenia: konwersja Start→Standard→Pro, churn, aktywacja (% obiektów z ≥1 rezerwacją), NRR.

### 6.3 Jednostkowa ekonomia (kierunkowo)
- Koszt obsługi obiektu bliski zera (self-service, tania infrastruktura serverless).
- Główny koszt zmienny: SMS-y (SMSAPI, ~7–16 gr/szt.) — do rozważenia limity SMS per plan lub przerzucenie kosztu. Bramka płatności nie obciąża platformy: każdy obiekt ma własne konto P24 i sam rozlicza prowizję bramki.
- Dźwignia wzrostu: **efekt katalogu** (obiekty na rezio.pl generują ruch i wiarygodność) + SEO (JSON-LD, opinie w Google).

### 6.4 Uwaga o gatingu funkcji
Obecnie w kodzie egzekwowany jest **tylko limit jednostek** per plan. Przypisanie pozostałych funkcji do planów (np. „meldunek online od Standard") to na razie **komunikacja marketingowa** w cenniku. Twarde ograniczanie funkcji per plan to jeden z pierwszych kroków monetyzacyjnych do wdrożenia (patrz roadmapa).

---

## 7. Pomysły i roadmapa

Priorytetyzacja: wartość biznesowa × wykonalność (bez sprzętu/certyfikacji).

### Priorytet 1 — monetyzacja i zgodność
- **Gating funkcji per plan** — twarde ograniczanie (nie tylko copy). Bezpośrednio napędza upgrade'y. Niski nakład.
- **KSeF** — integracja z Krajowym Systemem e-Faktur (obowiązek dla firm od 2026). Naturalne rozszerzenie modułu faktur; silny argument sprzedażowy „zgodność z prawem out-of-the-box".
- **Serwerowy PDF faktur** — dziś PDF powstaje przez druk przeglądarki; realny plik do wysyłki e-mailem podniesie profesjonalizm.

### Priorytet 2 — wzrost przychodu obiektu (i naszego GMV)
- **Upselling** — płatne dodatki (śniadanie, parking, późne wymeldowanie, zwierzę) wybierane przy rezerwacji lub w karcie, z dopłatą przez P24. Wpina się w istniejący meldunek i czat.
- **Vouchery / bony podarunkowe** — kwotowe i okolicznościowe; dodatkowe źródło sprzedaży poza sezonem.
- **Pakiety** (nocleg + usługi w cenie).

### Priorytet 3 — dojrzałość operacyjna i zasięg
- **Housekeeping** — panel sprzątania (statusy pokoi z przyjazdów/wyjazdów, konta ekipy).
- **Wiele obiektów na konto + role zespołu / panel właściciela apartamentu** — otwiera segment firm zarządzających. Wymaga refaktoru modelu (dziś User 1:1 Property).
- **Wielojęzyczność (EN/DE)** strony rezerwacji — dla gości zagranicznych (realna alternatywa dla Bookinga).
- **Dwukierunkowy channel manager** (API OTA) — największa przewaga HOTRES, ale wymaga certyfikacji partnerskiej (projekt wielomiesięczny). Do zaplanowania jako inwestycja strategiczna.

### Priorytet 4 — konwersja i marketing
- **AI-agent / chatbot** na stronie obiektu (odpowiada na pytania, prowadzi do rezerwacji).
- **Newsletter / konto gościa** (marketing do bazy gości).
- **Więcej bramek płatności** (PayU, Tpay) i płatność końcowa (nie tylko zaliczka), zwroty.
- **Aplikacja mobilna** dla recepcji (lub PWA jako tańsza alternatywa).

### Dług techniczny (poza funkcjami, ale istotny biznesowo)
- **Rate limiting** na publicznych akcjach (rezerwacja, czat, meldunek) — ochrona przed nadużyciami.
- Testy integracyjne server actions (dziś pokryte głównie czyste helpery).
- `SMSAPI_TOKEN` w konfiguracji self-host (docker-compose).

---

## 8. Ryzyka i otwarte kwestie

| Ryzyko | Opis | Mitygacja |
|---|---|---|
| **Zależność od jednokierunkowego iCal** | Bez API OTA synchronizacja jest wolniejsza (godzina) i bez cen — ryzyko rzadkich podwójnych rezerwacji. | Wykrywanie konfliktów już działa; docelowo API po certyfikacji. |
| **Koszt SMS** | Rosnie z wolumenem; może zjeść marżę na tanich planach. | Limity per plan lub przerzucenie kosztu; e-mail jako domyślny kanał. |
| **Akwizycja** | Freemium wymaga ruchu; mały obiekt trudno dotrzeć. | SEO (opinie w Google, katalog rezio.pl), efekt polecenia, treści. |
| **Zgodność (RODO, KSeF)** | Dane gości i faktury to obszar regulowany. | Minimalizacja danych (brak skanów), retencja PII, KSeF na roadmapie. |
| **Gating tylko na limitach** | Wyższe plany mogą nie mieć wystarczającej wartości bez twardego gatingu. | Priorytet 1 roadmapy. |

---

## 9. Stack (dla kontekstu inwestorskiego/technicznego)

- **Frontend/Backend:** Next.js 16 (App Router, Server Actions) + React 19 + TypeScript, Tailwind CSS 4.
- **Baza:** PostgreSQL (Supabase) + Prisma ORM. **Hosting:** Vercel (serverless, cron), storage zdjęć: Vercel Blob. Alternatywnie self-host (Docker).
- **Integracje:** Przelewy24 (płatności), SMSAPI (SMS), Resend (e-mail) — wszystkie z bezpiecznym fallbackiem (symulacja/konsola) bez konfiguracji.
- **Cechy:** niski koszt utrzymania (serverless), szybkie wdrożenie nowego obiektu, brak wdrożeniowca, gotowość na skalę SaaS.

---

*Dokument roboczy — aktualizować wraz z rozwojem produktu. Szczegóły techniczne: [README.md](README.md).*
