import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  Check,
  CreditCard,
  FileText,
  KeyRound,
  Luggage,
  MapPin,
  MessageSquare,
  PenLine,
  BadgePercent,
  RefreshCw,
  Smartphone,
  Star,
  TrendingUp,
  X,
} from "lucide-react";
import Logo from "@/components/Logo";
import { demoLogin } from "@/lib/actions";
import { getLatestPosts, formatBlogDate } from "@/lib/blog";
import { prisma } from "@/lib/db";
import { formatPln } from "@/lib/format";
import { appUrl } from "@/lib/payments";
import { PLANS } from "@/lib/plans";

// ISR: landing (katalog obiektów + blog) cache'owany, odświeżany co 5 min
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Rezio — system rezerwacji online bez prowizji dla obiektów noclegowych",
  description:
    "Silnik rezerwacji, channel manager (Booking.com, Airbnb), płatności BLIK, meldunek online z e-podpisem, SMS-y, opinie gości, ceny dynamiczne i faktury. Stały abonament od 0 zł — zero prowizji od rezerwacji.",
  keywords: [
    "system rezerwacji",
    "silnik rezerwacji",
    "booking engine",
    "channel manager",
    "rezerwacje online bez prowizji",
    "system rezerwacji dla pensjonatu",
    "system rezerwacji apartamentów",
    "meldunek online",
    "karta meldunkowa online",
    "ceny dynamiczne hotel",
    "faktura za nocleg",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: "Rezio — rezerwacje online bez prowizji",
    description:
      "Strona rezerwacji, channel manager, meldunek online, SMS-y i faktury — kompletna recepcja dla małych obiektów noclegowych. Abonament zamiast prowizji.",
    type: "website",
    locale: "pl_PL",
  },
};

const FAQ = [
  {
    q: "Czy Rezio pobiera prowizję od rezerwacji?",
    a: "Nie. Płacisz stały miesięczny abonament (od 0 zł w planie Start), a wszystkie rezerwacje z Twojej strony są bez prowizji. Portale OTA pobierają 15–25% — u nas gość rezerwuje bezpośrednio u Ciebie.",
  },
  {
    q: "Jak działa synchronizacja z Booking.com i Airbnb?",
    a: "Przez kalendarze iCal w obie strony: Rezio importuje zajęte terminy z portali i wystawia własny kalendarz do podpięcia u nich. Synchronizacja odbywa się automatycznie co godzinę, a system ostrzega przed podwójnymi rezerwacjami.",
  },
  {
    q: "Jakie płatności online obsługuje Rezio?",
    a: "Zaliczki przez Przelewy24: BLIK, karty płatnicze i szybkie przelewy. Rezerwacja potwierdza się automatycznie po wpłacie, a nieopłacone rezerwacje same zwalniają termin po 30 minutach.",
  },
  {
    q: "Czy mogę przetestować system za darmo?",
    a: "Tak — plan Start jest bezpłatny bezterminowo (do 3 jednostek), a bez zakładania konta możesz kliknąć „Zobacz demo panelu” i obejrzeć panel recepcji na przykładowych danych.",
  },
  {
    q: "Czy gość może sam zmienić termin rezerwacji?",
    a: "Tak. Każda rezerwacja ma panel gościa, w którym można zmienić daty i liczbę osób (z automatycznym przeliczeniem ceny wg cennika) albo anulować pobyt — bez telefonów do recepcji.",
  },
  {
    q: "Ile trwa wdrożenie systemu rezerwacji?",
    a: "Około 30 minut: zakładasz konto, dodajesz typy pokoi z cenami i zdjęciami — i Twoja strona rezerwacji działa pod własnym adresem. Kreator prowadzi Cię krok po kroku.",
  },
  {
    q: "Jak działa meldunek online?",
    a: "Po potwierdzeniu rezerwacji gość dostaje link do karty meldunkowej: wypełnia dane, podpisuje się palcem lub myszką i od razu widzi instrukcje przyjazdu (kody do drzwi, WiFi, dojazd). Ty masz gotową kartę meldunkową do druku — bez kolejki na recepcji i bez skanowania dowodów.",
  },
  {
    q: "Czy Rezio wysyła SMS-y i prosi gości o opinie?",
    a: "Tak. Gość dostaje SMS z potwierdzeniem rezerwacji i przypomnienie dzień przed przyjazdem, a dzień po wymeldowaniu — prośbę o opinię. Opinie z gwiazdkami trafiają na Twoją stronę obiektu (także do wyników Google), a Ty możesz na nie publicznie odpowiadać.",
  },
  {
    q: "Czy wystawię gościowi fakturę?",
    a: "Tak — fakturę VAT, zaliczkową lub proforma wystawisz jednym kliknięciem z rezerwacji. System sam numeruje dokumenty, rozbija kwoty brutto na netto i VAT (8%/23%) i podstawia dane nabywcy z rezerwacji.",
  },
  {
    q: "Czym są ceny dynamiczne?",
    a: "Regułami, które same korygują ceny za noc: podwyżka w weekendy i przy wysokim obłożeniu, rabat last minute na domykanie luk. Ustawiasz raz — a cennik pracuje za Ciebie we wszystkich wycenach.",
  },
];

const FEATURES = [
  {
    icon: BadgePercent,
    title: "Zero prowizji",
    desc: "Stały abonament zamiast 15–25% dla portali. Rezerwacje bezpośrednie zostają w Twojej kieszeni.",
  },
  {
    icon: RefreshCw,
    title: "Channel manager",
    desc: "Synchronizacja iCal z Booking.com, Airbnb i Vrbo co godzinę + alerty o podwójnych rezerwacjach.",
  },
  {
    icon: CreditCard,
    title: "Płatności online",
    desc: "BLIK, karty i szybkie przelewy przez Przelewy24. Zaliczka potwierdza rezerwację automatycznie.",
  },
  {
    icon: PenLine,
    title: "Meldunek online z e-podpisem",
    desc: "Gość wypełnia kartę meldunkową przed przyjazdem i podpisuje palcem. Bez kolejki na recepcji i bez skanów dowodów.",
  },
  {
    icon: KeyRound,
    title: "Instrukcje przyjazdu",
    desc: "Kody do drzwi, WiFi i dojazd odblokowują się po meldunku online. Samodzielne zameldowanie bez telefonów.",
  },
  {
    icon: MessageSquare,
    title: "Czat z gościem",
    desc: "Wiadomości przypięte do rezerwacji z powiadomieniami e-mail. Koniec z szukaniem ustaleń w SMS-ach i telefonach.",
  },
  {
    icon: Smartphone,
    title: "SMS-y do gości",
    desc: "Potwierdzenie rezerwacji i przypomnienie dzień przed przyjazdem — automatycznie, o ludzkiej porze.",
  },
  {
    icon: Star,
    title: "Opinie gości",
    desc: "Automatyczna prośba o opinię po pobycie, moderacja i odpowiedzi. Gwiazdki trafiają do wyników Google.",
  },
  {
    icon: TrendingUp,
    title: "Ceny dynamiczne",
    desc: "Drożej w weekendy i przy pełnym obłożeniu, rabat last minute. Reguły raz ustawione pracują same.",
  },
  {
    icon: FileText,
    title: "Faktury",
    desc: "VAT, zaliczkowa lub proforma jednym kliknięciem z rezerwacji. Numeracja, netto/VAT i rejestr w komplecie.",
  },
  {
    icon: Luggage,
    title: "Panel gościa",
    desc: "Gość sam zmienia termin, liczbę osób lub anuluje — z przeliczeniem ceny według cennika.",
  },
  {
    icon: BarChart3,
    title: "Raporty i obłożenie",
    desc: "Przychody, ADR i obłożenie per kanał sprzedaży. Eksport CSV do księgowości.",
  },
];

// automatyczna ścieżka gościa — od rezerwacji do opinii
const JOURNEY = [
  {
    icon: BellRing,
    title: "Rezerwacja 24/7",
    desc: "Gość rezerwuje na Twojej stronie — z cennikiem sezonowym i cenami dynamicznymi.",
  },
  {
    icon: CreditCard,
    title: "Zaliczka BLIK-iem",
    desc: "Płatność potwierdza rezerwację automatycznie. Nieopłacone same zwalniają termin.",
  },
  {
    icon: PenLine,
    title: "Meldunek online",
    desc: "Karta meldunkowa z e-podpisem wypełniona przed przyjazdem — zero papierologii.",
  },
  {
    icon: KeyRound,
    title: "Instrukcje i SMS",
    desc: "Po meldunku gość widzi kody i dojazd, a dzień przed przyjazdem dostaje SMS.",
  },
  {
    icon: MessageSquare,
    title: "Czat w trakcie pobytu",
    desc: "Pytania i ustalenia w jednym wątku przy rezerwacji, z powiadomieniami.",
  },
  {
    icon: Star,
    title: "Opinia po wyjeździe",
    desc: "Automatyczna prośba o ocenę — gwiazdki lądują na Twojej stronie i w Google.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Załóż konto i dodaj pokoje",
    desc: "Nazwa obiektu, typy pokoi, ceny, zdjęcia i udogodnienia. Kreator prowadzi Cię krok po kroku — bez karty kredytowej.",
  },
  {
    n: "2",
    title: "Podepnij kanały i płatności",
    desc: "iCal z Booking.com i Airbnb w obie strony, BLIK przez Przelewy24. Kalendarze same pilnują dostępności.",
  },
  {
    n: "3",
    title: "Przyjmuj rezerwacje 24/7",
    desc: "Twoja strona działa pod własnym adresem. Zaliczka potwierdza pobyt, system melduje gości, wysyła SMS-y i prosi o opinie.",
  },
];

const COMPARISON: [string, string, string][] = [
  ["Prowizja od rezerwacji", "0 zł — stały abonament", "15–25% każdej rezerwacji"],
  ["Dane i kontakt do gościa", "Twoje, od pierwszej chwili", "ukryte za portalem"],
  ["Marka i strona obiektu", "Twoja własna strona", "profil w cudzym serwisie"],
  ["Zmiana terminu przez gościa", "samoobsługa online", "telefon / wiadomości"],
  ["Meldunek i karta meldunkowa", "online, z e-podpisem", "papier na recepcji"],
  ["Opinie gości", "na Twojej stronie i w Google", "zostają na portalu"],
  ["Faktura dla gościa", "jedno kliknięcie z rezerwacji", "poza systemem"],
  ["Raporty i obłożenie per kanał", "wbudowane", "brak lub płatne dodatki"],
];

// macierz funkcji per plan: true/false lub tekst (np. limit)
const PRICE_MATRIX: {
  group: string;
  rows: [string, string | boolean, string | boolean, string | boolean][];
}[] = [
  {
    group: "Sprzedaż",
    rows: [
      ["Jednostki (pokoje / apartamenty)", "3", "15", "bez limitu"],
      ["Strona obiektu z rezerwacją online", true, true, true],
      ["Cennik sezonowy i min. długość pobytu", true, true, true],
      ["Kody promocyjne", false, true, true],
      ["Ceny dynamiczne (weekend / last minute / obłożenie)", false, false, true],
      ["Płatności online — BLIK, karty (Przelewy24)", false, true, true],
    ],
  },
  {
    group: "Kanały sprzedaży",
    rows: [
      ["Channel manager iCal (Booking.com, Airbnb, Vrbo)", false, true, true],
      ["Alerty o podwójnych rezerwacjach", false, true, true],
    ],
  },
  {
    group: "Obsługa gościa",
    rows: [
      ["Panel gościa — zmiana terminu, anulowanie", true, true, true],
      ["E-maile do gości", true, true, true],
      ["Opinie gości z moderacją i odpowiedziami", true, true, true],
      ["Meldunek online z e-podpisem + instrukcje przyjazdu", false, true, true],
      ["Czat z gościem", false, true, true],
      ["SMS-y — potwierdzenia i przypomnienia", false, true, true],
    ],
  },
  {
    group: "Biuro i analityka",
    rows: [
      ["Faktury VAT / zaliczkowe / proforma", false, false, true],
      ["Raporty przychodów i obłożenia per kanał", false, false, true],
      ["Eksport CSV do księgowości", false, false, true],
      ["Priorytetowe wsparcie", false, false, true],
    ],
  },
];

const QUOTES = [
  {
    text: "Pierwsza rezerwacja bezpośrednia spłynęła jeszcze w dniu założenia konta. Konfiguracja faktycznie zajęła pół godziny.",
    who: "Marta",
    role: "apartamenty, Sopot",
  },
  {
    text: "Koniec z podwójnymi rezerwacjami między Bookingiem a telefonem. Kalendarze pilnują się same, a ja widzę wszystko w jednym miejscu.",
    who: "Tomasz",
    role: "chata górska, Zakopane",
  },
  {
    text: "W pierwszy sezon jedna trzecia rezerwacji przeszła na mój własny kanał. To czysta oszczędność na prowizjach.",
    who: "Dariusz",
    role: "willa nad jeziorem, Mazury",
  },
];

// mini-kalendarz w podglądzie panelu: [%% bezpośrednia, %% OTA]
const MOCK_CAL: [number, number][] = [
  [60, 0],
  [75, 0],
  [55, 27],
  [50, 32],
  [60, 30],
  [45, 55],
  [40, 60],
  [0, 70],
  [65, 0],
  [100, 0],
];

export default async function HomePage() {
  const properties = await prisma.property.findMany({
    where: { suspended: false, unitTypes: { some: {} } },
    include: {
      unitTypes: true,
      photos: { where: { propertyId: { not: null } }, orderBy: { id: "asc" }, take: 1 },
    },
    orderBy: { id: "asc" },
  });
  const latestPosts = getLatestPosts(3);

  const base = appUrl();
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Rezio",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "System rezerwacji online bez prowizji dla obiektów noclegowych: silnik rezerwacji, channel manager, płatności online, meldunek online z e-podpisem, SMS-y, opinie gości, ceny dynamiczne, faktury i panel recepcji.",
      url: base,
      offers: PLANS.map((p) => ({
        "@type": "Offer",
        name: `Plan ${p.label}`,
        price: String(p.priceZl),
        priceCurrency: "PLN",
        description: p.blurb,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Rezio",
      url: base,
      description: "Platforma rezerwacji bezpośrednich dla obiektów noclegowych.",
    },
  ];

  return (
    <div className="space-y-20 sm:space-y-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ---------- HERO (4a: jasne tło, radialna poświata zieleni) ---------- */}
      <section className="relative">
        <div
          className="pointer-events-none absolute -inset-x-4 -top-8 bottom-0 -z-10 rounded-b-[40px]"
          style={{
            background: "radial-gradient(120% 90% at 85% 0%, #eef7f1 0%, transparent 60%)",
          }}
        />
        <div className="grid items-center gap-12 py-10 sm:py-14 lg:grid-cols-2">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-brand-100 px-3 py-1.5 text-xs font-semibold text-brand-600">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
              System rezerwacji dla obiektów noclegowych · Polska
            </p>
            <h1 className="mt-5 text-[40px] font-bold leading-[1.04] tracking-[-0.03em] text-brand-900 sm:text-[52px]">
              Twoi goście.
              <br />
              Twoje rezerwacje.
              <br />
              <span className="text-brand-600">Zero prowizji.</span>
            </h1>
            <p className="mt-5 max-w-[480px] text-base leading-relaxed text-slate-600">
              Strona rezerwacji, channel manager, meldunek online, SMS-y i faktury —
              kompletna recepcja w jednym panelu. Wdrożenie w 30 minut, abonament od
              0 zł zamiast oddawania 15–25% portalom.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/rejestracja"
                className="btn-primary px-6 py-3.5 text-[15px] shadow-[0_10px_24px_-10px_rgba(18,56,41,0.8)]"
              >
                Zarejestruj obiekt za darmo
              </Link>
              <form action={demoLogin}>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-3.5 text-[15px] font-semibold text-brand-900 transition-colors hover:bg-slate-100"
                >
                  Zobacz demo panelu
                  <ArrowRight size={16} strokeWidth={2} />
                </button>
              </form>
            </div>
            <div className="mt-9 flex gap-9 border-t border-slate-200 pt-7">
              {[
                ["0%", "prowizji od rezerwacji"],
                ["30 min", "do pierwszej rezerwacji"],
                ["24/7", "sprzedaż online"],
              ].map(([v, l]) => (
                <div key={l}>
                  <p className="nums text-[30px] font-bold tracking-[-0.02em] text-brand-900">
                    {v}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-slate-500">{l}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Podgląd panelu (4a) */}
          <div className="relative hidden md:block" aria-hidden>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_30px_60px_-25px_rgba(18,56,41,0.35)]">
              <div className="flex items-center gap-2 bg-brand-900 px-4 py-3">
                <span className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-brand-400 text-sm font-bold leading-none text-brand-950">
                  R
                </span>
                <span className="text-[13px] font-bold tracking-[-0.02em] text-white">
                  Rezio
                </span>
                <span className="ml-2 text-[11px] text-[#8fb5a2]">· Pulpit · Willa Rezio</span>
                <span className="ml-auto rounded-full bg-brand-400 px-2 py-0.5 text-[9.5px] font-bold text-brand-950">
                  PRO
                </span>
              </div>
              <div className="space-y-2.5 bg-slate-50 p-3.5">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-[10px] border border-slate-200 bg-white px-3 py-2.5">
                    <p className="text-[10px] font-semibold text-slate-500">Przyjazdy dziś</p>
                    <p className="nums mt-1 text-[21px] font-bold leading-none">4</p>
                  </div>
                  <div className="rounded-[10px] border border-slate-200 bg-white px-3 py-2.5">
                    <p className="text-[10px] font-semibold text-slate-500">Obłożenie</p>
                    <p className="nums mt-1 text-[21px] font-bold leading-none">82%</p>
                  </div>
                  <div className="rounded-[10px] bg-brand-900 px-3 py-2.5">
                    <p className="text-[10px] font-semibold text-[#8fb5a2]">Przychód</p>
                    <p className="nums mt-1 text-[21px] font-bold leading-none text-white">
                      12 480 zł
                    </p>
                  </div>
                </div>
                <div className="rounded-[10px] border border-slate-200 bg-white px-3.5 py-3">
                  <p className="mb-2 text-[11px] font-bold">Kalendarz obłożenia · lipiec</p>
                  <div className="grid grid-cols-10 gap-1">
                    {MOCK_CAL.map(([direct, ota], i) => (
                      <span
                        key={i}
                        className={`h-[30px] rounded ${i === 3 ? "outline outline-2 outline-offset-1 outline-brand-600" : ""}`}
                        style={{
                          background: `linear-gradient(to bottom, #1f7a4d ${direct}%, #8fc7a9 ${direct}% ${direct + ota}%, #e9efec ${direct + ota}%)`,
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-[10px] border border-slate-200 bg-white px-3.5 py-2.5">
                  <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-brand-100 text-brand-600">
                    <CreditCard size={14} strokeWidth={2} />
                  </span>
                  <span className="flex-1">
                    <span className="block text-[11.5px] font-semibold">
                      Zaliczka 216 zł opłacona
                    </span>
                    <span className="block text-[10.5px] text-slate-400">
                      BLIK · przed chwilą
                    </span>
                  </span>
                  <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[9.5px] font-bold text-brand-600">
                    Nowa
                  </span>
                </div>
              </div>
            </div>
            {/* pływająca plakietka opinii */}
            <div className="animate-float absolute -bottom-4 -left-4 flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-[0_12px_28px_-12px_rgba(18,56,41,0.4)]">
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-brand-100 text-brand-600">
                <Star size={16} strokeWidth={2} fill="currentColor" />
              </span>
              <span>
                <span className="block text-xs font-bold">Nowa opinia ★★★★★</span>
                <span className="block text-[10.5px] text-slate-400">
                  „Cudowne miejsce, wrócimy!”
                </span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- JAK TO DZIAŁA ---------- */}
      <section id="jak-to-dziala" className="reveal space-y-8">
        <div className="space-y-2 text-center">
          <h2 className="text-3xl font-bold text-brand-900">
            Od zera do rezerwacji w 30 minut
          </h2>
          <p className="text-slate-500">Trzy kroki — bez umów, bez karty, bez czekania.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div
              key={s.n}
              className="card relative space-y-2 p-6 pt-8 transition-shadow hover:shadow-md"
            >
              <span className="absolute -top-5 left-6 grid h-10 w-10 place-items-center rounded-2xl bg-brand-900 font-bold text-brand-400 shadow-lg">
                {s.n}
              </span>
              <h3 className="font-bold text-brand-900">{s.title}</h3>
              <p className="text-sm leading-relaxed text-slate-600">{s.desc}</p>
              {i < 2 && (
                <span
                  className="absolute -right-4 top-1/2 hidden text-slate-300 md:block"
                  aria-hidden
                >
                  <ArrowRight size={22} strokeWidth={2.4} />
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ---------- ŚCIEŻKA GOŚCIA ---------- */}
      <section className="reveal space-y-8">
        <div className="space-y-2 text-center">
          <h2 className="text-3xl font-bold text-brand-900">
            Obsługa gościa dzieje się sama
          </h2>
          <p className="text-slate-500">
            Od rezerwacji do opinii w Google — automatycznie. Ty tylko witasz gości.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {JOURNEY.map((s, i) => (
            <div
              key={s.title}
              className="card relative space-y-1.5 p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <s.icon size={19} strokeWidth={2} />
                </span>
                <span className="nums text-xs font-bold text-slate-300">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="font-bold text-brand-900">{s.title}</h3>
              <p className="text-sm leading-relaxed text-slate-600">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- FUNKCJE ---------- */}
      <section id="funkcje" className="reveal space-y-8">
        <div className="space-y-2 text-center">
          <h2 className="text-3xl font-bold text-brand-900">
            Wszystko, czego potrzebuje Twoja recepcja
          </h2>
          <p className="text-slate-500">
            Jeden panel zamiast pięciu narzędzi i zeszytu na recepcji.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="card space-y-3 p-6 transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <f.icon size={20} strokeWidth={2} />
              </span>
              <h3 className="font-bold text-brand-900">{f.title}</h3>
              <p className="text-sm leading-relaxed text-slate-600">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- PORÓWNANIE ---------- */}
      <section className="reveal space-y-8">
        <div className="space-y-2 text-center">
          <h2 className="text-3xl font-bold text-brand-900">
            Rezerwacja bezpośrednia się opłaca
          </h2>
          <p className="text-slate-500">
            Przy 100 000 zł obrotu rocznie portale zabierają 15–25 tys. zł. Rezio — od
            0 do 1788 zł rocznie.
          </p>
        </div>
        <div className="card mx-auto max-w-3xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="w-2/5 px-5 py-3.5" />
                <th className="bg-brand-50 px-5 py-3.5 font-bold text-brand-800">Rezio</th>
                <th className="px-5 py-3.5 font-semibold text-slate-500">Portale OTA</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map(([label, us, them]) => (
                <tr key={label} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-3 font-medium text-slate-700">{label}</td>
                  <td className="bg-brand-50/60 px-5 py-3 font-semibold text-brand-900">
                    <span className="flex items-start gap-1.5">
                      <Check size={15} strokeWidth={2.6} className="mt-0.5 flex-none text-brand-600" />
                      {us}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-500">
                    <span className="flex items-start gap-1.5">
                      <X size={15} strokeWidth={2.4} className="mt-0.5 flex-none text-danger-500" />
                      {them}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------- OBIEKTY ---------- */}
      <section id="obiekty" className="reveal space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-brand-900">Obiekty na Rezio</h2>
            <p className="mt-1 text-sm text-slate-500">
              Rezerwuj bezpośrednio — wspierasz obiekt, nie pośrednika.
            </p>
          </div>
        </div>
        {properties.length === 0 && (
          <p className="card px-6 py-10 text-center text-slate-500">
            Nie ma jeszcze żadnych obiektów.{" "}
            <Link href="/rejestracja" className="font-semibold text-brand-600 hover:underline">
              Dodaj pierwszy!
            </Link>
          </p>
        )}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map((p) => {
            const minPrice = Math.min(...p.unitTypes.map((ut) => ut.basePriceGr));
            return (
              <Link
                key={p.id}
                href={`/o/${p.slug}`}
                className="card group flex flex-col overflow-hidden transition-all hover:border-brand-600 hover:shadow-lg"
              >
                {p.photos[0] ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={p.photos[0].path}
                    alt={p.name}
                    className="h-44 w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div
                    className="tnum grid h-32 place-items-center text-[10px] text-slate-400"
                    style={{
                      background:
                        "repeating-linear-gradient(45deg,#eef3f0,#eef3f0 8px,#e6ede9 8px,#e6ede9 16px)",
                    }}
                  >
                    zdjęcie obiektu
                  </div>
                )}
                <div className="flex flex-1 flex-col space-y-2 p-5">
                  <h3 className="text-lg font-bold text-brand-900">{p.name}</h3>
                  {p.address && (
                    <p className="flex items-center gap-1 text-xs font-medium text-slate-500">
                      <MapPin size={12} strokeWidth={2} />
                      {p.address}
                    </p>
                  )}
                  <p className="line-clamp-2 flex-1 text-sm text-slate-600">{p.description}</p>
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-brand-600">
                      od <span className="tnum">{formatPln(minPrice)}</span>{" "}
                      <span className="text-sm font-medium text-slate-400">/ noc</span>
                    </p>
                    <span className="text-sm font-semibold text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
                      Zobacz →
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ---------- OPINIE WŁAŚCICIELI ---------- */}
      <section className="reveal space-y-8">
        <h2 className="text-center text-3xl font-bold text-brand-900">
          Właściciele o Rezio
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          {QUOTES.map((q) => (
            <figure key={q.who} className="card flex flex-col space-y-4 p-6">
              <p className="flex gap-0.5 text-brand-600" aria-label="5 gwiazdek">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star key={i} size={15} strokeWidth={2} fill="currentColor" />
                ))}
              </p>
              <blockquote className="flex-1 text-sm leading-relaxed text-slate-700">
                „{q.text}”
              </blockquote>
              <figcaption className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-600 font-bold text-white">
                  {q.who[0]}
                </span>
                <span>
                  <span className="block text-sm font-bold text-brand-900">{q.who}</span>
                  <span className="block text-xs text-slate-500">{q.role}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ---------- CENNIK ---------- */}
      <section id="cennik" className="reveal space-y-8">
        <div className="space-y-2 text-center">
          <h2 className="text-3xl font-bold text-brand-900">Prosty cennik, zero prowizji</h2>
          <p className="text-slate-500">
            Płacisz za system, nie za sukces. Każda rezerwacja jest w 100% Twoja.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.key}
              className={`card flex flex-col space-y-4 p-7 transition-all hover:shadow-lg ${
                p.highlighted
                  ? "relative border-2 border-brand-600 shadow-lg md:scale-[1.03]"
                  : ""
              }`}
            >
              {p.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-900 px-4 py-1 text-xs font-bold text-brand-400 shadow">
                  Najczęściej wybierany
                </span>
              )}
              <div>
                <h3 className="text-lg font-bold text-brand-900">{p.label}</h3>
                <p className="text-sm text-slate-500">{p.blurb}</p>
              </div>
              <p className="nums text-5xl font-bold text-brand-900">
                {p.priceZl}
                <span className="text-base font-semibold text-slate-400"> zł/mc</span>
              </p>
              <ul className="flex-1 space-y-2.5 text-sm text-slate-600">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check size={15} strokeWidth={2.6} className="mt-0.5 flex-none text-brand-600" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/rejestracja"
                className={p.highlighted ? "btn-primary w-full py-3" : "btn-quiet w-full py-3"}
              >
                Wybierz {p.label}
              </Link>
            </div>
          ))}
        </div>

        {/* pełna macierz funkcji */}
        <details className="card group mx-auto max-w-4xl overflow-hidden">
          <summary className="cursor-pointer select-none list-none px-6 py-4 text-center font-semibold text-brand-900 transition-colors hover:bg-brand-50">
            Porównaj wszystkie funkcje planów{" "}
            <span className="text-slate-400 group-open:hidden">▾</span>
            <span className="hidden text-slate-400 group-open:inline">▴</span>
          </summary>
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="w-1/2 px-5 py-3" />
                  {PLANS.map((p) => (
                    <th
                      key={p.key}
                      className={`px-4 py-3 text-center font-bold ${
                        p.highlighted ? "bg-brand-50 text-brand-800" : "text-slate-600"
                      }`}
                    >
                      {p.label}
                      <span className="nums block text-xs font-medium text-slate-400">
                        {p.priceZl} zł/mc
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PRICE_MATRIX.map((g) => (
                  <React.Fragment key={g.group}>
                    <tr className="bg-slate-50">
                      <td colSpan={4} className="th px-5 py-2">
                        {g.group}
                      </td>
                    </tr>
                    {g.rows.map(([label, ...cells]) => (
                      <tr key={label} className="border-b border-slate-100 last:border-0">
                        <td className="px-5 py-2.5 text-slate-700">{label}</td>
                        {cells.map((c, i) => (
                          <td
                            key={i}
                            className={`px-4 py-2.5 text-center ${
                              PLANS[i].highlighted ? "bg-brand-50/60" : ""
                            }`}
                          >
                            {c === true ? (
                              <Check
                                size={15}
                                strokeWidth={2.6}
                                className="inline text-brand-600"
                              />
                            ) : c === false ? (
                              <span className="text-slate-300">—</span>
                            ) : (
                              <span className="font-semibold text-slate-700">{c}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <p className="text-center text-xs text-slate-400">
          Wszystkie plany: bez umowy na czas określony, bez prowizji od rezerwacji,
          zmiana planu w każdej chwili.
        </p>
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="faq" className="reveal mx-auto w-full max-w-3xl space-y-8">
        <h2 className="text-center text-3xl font-bold text-brand-900">
          Najczęstsze pytania
        </h2>
        <div className="space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="faq card overflow-hidden">
              <summary className="cursor-pointer select-none list-none px-6 py-4 font-semibold text-brand-900 transition-colors hover:bg-brand-50">
                {f.q}
              </summary>
              <p className="px-6 pb-5 pt-1 text-sm leading-relaxed text-slate-600">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ---------- BLOG / PORADNIK ---------- */}
      {latestPosts.length > 0 && (
        <section className="reveal space-y-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold text-brand-900">Z poradnika Rezio</h2>
              <p className="mt-1 text-slate-500">
                Praktyczna wiedza o rezerwacjach bez prowizji i prowadzeniu obiektu.
              </p>
            </div>
            <Link
              href="/blog"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"
            >
              Wszystkie artykuły
              <ArrowRight size={15} strokeWidth={2} />
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {latestPosts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="card group flex flex-col overflow-hidden transition-all hover:border-brand-600 hover:shadow-md"
              >
                <div
                  className="h-36 bg-cover bg-center"
                  style={
                    post.cover
                      ? { backgroundImage: `url(${post.cover})` }
                      : {
                          background:
                            "repeating-linear-gradient(45deg,#eef3f0,#eef3f0 10px,#e6ede9 10px,#e6ede9 20px)",
                        }
                  }
                />
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    {post.tag && (
                      <span className="rounded-full bg-brand-100 px-2 py-0.5 font-semibold text-brand-700">
                        {post.tag}
                      </span>
                    )}
                    <span className="tnum">{formatBlogDate(post.date)}</span>
                  </div>
                  <h3 className="font-bold leading-snug text-brand-900">{post.title}</h3>
                  <p className="line-clamp-2 flex-1 text-[13px] leading-relaxed text-slate-600">
                    {post.excerpt}
                  </p>
                  <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-600">
                    Czytaj
                    <ArrowRight
                      size={14}
                      strokeWidth={2}
                      className="transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ---------- CTA BAND (4a: ciemna zieleń + duże logo D) ---------- */}
      <section className="reveal">
        <div className="relative overflow-hidden rounded-3xl bg-brand-900 px-8 py-14 text-center text-white">
          <div className="absolute -bottom-24 -right-24 h-[280px] w-[280px] rounded-full bg-brand-400/10" />
          <div className="relative space-y-5">
            <div className="flex justify-center">
              <Logo size={76} tone="dark" wordmark={false} />
            </div>
            <h2 className="text-3xl font-bold tracking-[-0.025em] sm:text-[34px]">
              Gotowy na rezerwacje bez prowizji?
            </h2>
            <p className="mx-auto max-w-[520px] leading-relaxed text-[#a7cbb9]">
              Załóż konto, dodaj pokoje i cennik — Twoja strona rezerwacji ruszy w pół
              godziny. Plan Start jest darmowy bezterminowo.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-1">
              <Link href="/rejestracja" className="btn-accent px-7 py-3.5 text-[15px]">
                Zarejestruj obiekt za darmo
              </Link>
              <form action={demoLogin}>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-6 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-white/10"
                >
                  Zobacz demo panelu
                  <ArrowRight size={16} strokeWidth={2} />
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
