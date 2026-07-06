import type { Metadata } from "next";
import Link from "next/link";
import { demoLogin } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { formatPln } from "@/lib/format";
import { appUrl } from "@/lib/payments";
import { PLANS } from "@/lib/plans";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hostimo — system rezerwacji online bez prowizji dla obiektów noclegowych",
  description:
    "Silnik rezerwacji, channel manager (Booking.com, Airbnb), płatności BLIK i panel recepcji dla pensjonatów, willi i apartamentów. Stały abonament od 0 zł — zero prowizji od rezerwacji.",
  keywords: [
    "system rezerwacji",
    "silnik rezerwacji",
    "booking engine",
    "channel manager",
    "rezerwacje online bez prowizji",
    "system rezerwacji dla pensjonatu",
    "system rezerwacji apartamentów",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: "Hostimo — rezerwacje online bez prowizji",
    description:
      "Strona rezerwacji, channel manager i recepcja dla małych obiektów noclegowych. Abonament zamiast prowizji.",
    type: "website",
    locale: "pl_PL",
  },
};

const FAQ = [
  {
    q: "Czy Hostimo pobiera prowizję od rezerwacji?",
    a: "Nie. Płacisz stały miesięczny abonament (od 0 zł w planie Start), a wszystkie rezerwacje z Twojej strony są bez prowizji. Portale OTA pobierają 15–25% — u nas gość rezerwuje bezpośrednio u Ciebie.",
  },
  {
    q: "Jak działa synchronizacja z Booking.com i Airbnb?",
    a: "Przez kalendarze iCal w obie strony: Hostimo importuje zajęte terminy z portali i wystawia własny kalendarz do podpięcia u nich. Synchronizacja odbywa się automatycznie co godzinę, a system ostrzega przed podwójnymi rezerwacjami.",
  },
  {
    q: "Jakie płatności online obsługuje Hostimo?",
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
];

const FEATURES = [
  {
    icon: "💸",
    title: "Zero prowizji",
    desc: "Stały abonament zamiast 15–25% dla portali. Rezerwacje bezpośrednie zostają w Twojej kieszeni.",
    tile: "from-emerald-400/20 to-brand-200/40",
  },
  {
    icon: "🔄",
    title: "Channel manager",
    desc: "Synchronizacja iCal z Booking.com, Airbnb i Vrbo co godzinę + alerty o podwójnych rezerwacjach.",
    tile: "from-sky-400/20 to-brand-200/40",
  },
  {
    icon: "💳",
    title: "Płatności online",
    desc: "BLIK, karty i szybkie przelewy przez Przelewy24. Zaliczka potwierdza rezerwację automatycznie.",
    tile: "from-accent-400/30 to-accent-100",
  },
  {
    icon: "🧳",
    title: "Panel gościa",
    desc: "Gość sam zmienia termin, liczbę osób lub anuluje — z przeliczeniem ceny według cennika.",
    tile: "from-violet-400/20 to-brand-200/40",
  },
  {
    icon: "📊",
    title: "Raporty i obłożenie",
    desc: "Przychody, ADR i obłożenie per kanał sprzedaży. Eksport CSV do księgowości.",
    tile: "from-rose-400/20 to-accent-100",
  },
  {
    icon: "🏷️",
    title: "Kody promocyjne",
    desc: "Rabaty procentowe z limitem użyć i terminem ważności. Cennik sezonowy per typ pokoju.",
    tile: "from-amber-400/25 to-brand-100",
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
    desc: "Twoja strona rezerwacji działa pod własnym adresem. Zaliczka potwierdza pobyt, a Ty widzisz wszystko w jednym panelu.",
  },
];

const COMPARISON: [string, string, string][] = [
  ["Prowizja od rezerwacji", "0 zł — stały abonament", "15–25% każdej rezerwacji"],
  ["Dane i kontakt do gościa", "Twoje, od pierwszej chwili", "ukryte za portalem"],
  ["Marka i strona obiektu", "Twoja własna strona", "profil w cudzym serwisie"],
  ["Zmiana terminu przez gościa", "samoobsługa online", "telefon / wiadomości"],
  ["Raporty i obłożenie per kanał", "wbudowane", "brak lub płatne dodatki"],
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

// statyczny wzór mini-kalendarza w mockupie panelu (0 wolne, 1 rezerwacja, 2 kanał)
const MOCK_CAL = [
  0, 1, 1, 1, 0, 0, 2, 2, 0, 1, 1, 0, 0, 0, 0, 2, 2, 2, 1, 1, 0, 1, 1, 0, 0, 0, 2, 0,
];

export default async function HomePage() {
  const properties = await prisma.property.findMany({
    where: { unitTypes: { some: {} } },
    include: {
      unitTypes: true,
      photos: { where: { propertyId: { not: null } }, orderBy: { id: "asc" }, take: 1 },
    },
    orderBy: { id: "asc" },
  });

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
      name: "Hostimo",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "System rezerwacji online bez prowizji dla obiektów noclegowych: silnik rezerwacji, channel manager, płatności online i panel recepcji.",
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
      name: "Hostimo",
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

      {/* ---------- HERO ---------- */}
      <section>
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-950 via-brand-900 to-brand-700 text-white shadow-2xl">
          <div className="aurora-blob h-96 w-96 bg-accent-500/70 -top-24 -right-16" />
          <div
            className="aurora-blob h-80 w-80 bg-brand-500 top-1/2 -left-24"
            style={{ animationDelay: "-5s" }}
          />
          <div
            className="aurora-blob h-64 w-64 bg-emerald-300/60 bottom-0 right-1/3"
            style={{ animationDelay: "-9s" }}
          />
          <div className="absolute inset-0 grid-pattern" />

          <div className="relative grid gap-10 lg:grid-cols-[1.1fr_1fr] items-center px-8 sm:px-12 py-14 sm:py-18">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 backdrop-blur px-4 py-1.5 text-xs font-semibold tracking-wide">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                System rezerwacji dla obiektów noclegowych · Polska 🇵🇱
              </p>
              <h1 className="mt-5 text-4xl sm:text-6xl font-black tracking-tight leading-[1.05]">
                Twoi goście.
                <br />
                Twoje rezerwacje.
                <br />
                <span className="text-gradient">Zero prowizji.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-brand-100/90">
                Strona rezerwacji, channel manager i recepcja w jednym panelu.
                Wdrożenie w 30 minut, abonament od 0 zł — zamiast oddawania 15–25%
                portalom.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/rejestracja" className="btn-accent px-8 py-3.5 text-base shadow-lg shadow-accent-500/25">
                  Zarejestruj obiekt za darmo
                </Link>
                <form action={demoLogin}>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 border border-white/30 bg-white/5 hover:bg-white/15 backdrop-blur text-white font-semibold rounded-xl px-7 py-3.5 text-base transition-colors"
                  >
                    Zobacz demo panelu
                    <span aria-hidden>→</span>
                  </button>
                </form>
              </div>
              <div className="mt-9 grid grid-cols-3 gap-4 max-w-md text-center sm:text-left">
                {[
                  ["0%", "prowizji od rezerwacji"],
                  ["30 min", "do pierwszej rezerwacji"],
                  ["24/7", "sprzedaż online"],
                ].map(([v, l]) => (
                  <div key={l}>
                    <p className="text-2xl font-black text-accent-400">{v}</p>
                    <p className="text-xs text-brand-100/70">{l}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* mockup panelu */}
            <div className="relative hidden md:block" aria-hidden>
              <div className="animate-float-slow rounded-2xl bg-white text-slate-800 shadow-2xl ring-1 ring-black/20 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 border-b border-slate-200">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  <span className="ml-3 flex-1 rounded-md bg-white border border-slate-200 px-3 py-1 text-[11px] text-slate-400 font-mono">
                    hostimo.pl/admin
                  </span>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold">Pulpit · Willa Hostimo</p>
                    <span className="rounded-full bg-brand-100 text-brand-800 px-2 py-0.5 text-[10px] font-bold">
                      Pro
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ["4", "przyjazdy dziś"],
                      ["82%", "obłożenie"],
                      ["12 480 zł", "przychód / mc"],
                    ].map(([v, l]) => (
                      <div key={l} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                        <p className="text-base font-black text-brand-800">{v}</p>
                        <p className="text-[10px] text-slate-500">{l}</p>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-slate-500 mb-1.5">
                      Lipiec — kalendarz obłożenia
                    </p>
                    <div className="grid grid-cols-14 gap-1">
                      {MOCK_CAL.map((v, i) => (
                        <span
                          key={i}
                          className={`h-4 rounded ${
                            v === 1
                              ? "bg-brand-600"
                              : v === 2
                                ? "bg-accent-400"
                                : "bg-slate-100"
                          }`}
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex gap-3 text-[10px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded bg-brand-600 inline-block" /> bezpośrednie
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded bg-accent-400 inline-block" /> Booking/Airbnb
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div
                className="animate-float absolute -left-8 top-8 rounded-xl bg-white/95 backdrop-blur text-slate-800 shadow-xl ring-1 ring-black/10 px-4 py-3 text-xs font-semibold"
                style={{ "--tilt": "-3deg" } as React.CSSProperties}
              >
                💳 BLIK · zaliczka 216 zł
                <span className="block text-[10px] font-normal text-emerald-600">
                  ✓ opłacona przed chwilą
                </span>
              </div>
              <div
                className="animate-float absolute -right-4 -bottom-6 rounded-xl bg-white/95 backdrop-blur text-slate-800 shadow-xl ring-1 ring-black/10 px-4 py-3 text-xs font-semibold"
                style={{ "--tilt": "2deg", animationDelay: "-2s" } as React.CSSProperties}
              >
                🔔 Nowa rezerwacja HO-K2M4
                <span className="block text-[10px] font-normal text-slate-500">
                  Pokój Rodzinny · 3 noce · 1650 zł
                </span>
              </div>
              <div
                className="animate-float-slow absolute -right-8 top-16 rounded-xl bg-white/95 backdrop-blur text-slate-800 shadow-xl ring-1 ring-black/10 px-4 py-3 text-xs font-semibold"
                style={{ "--tilt": "3deg", animationDelay: "-4s" } as React.CSSProperties}
              >
                🔄 iCal zsynchronizowany
                <span className="block text-[10px] font-normal text-slate-500">
                  Booking.com · Airbnb · 12:00
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- JAK TO DZIAŁA ---------- */}
      <section className="reveal space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-black text-brand-950">
            Od zera do rezerwacji w 30 minut
          </h2>
          <p className="text-slate-500">Trzy kroki — bez umów, bez karty, bez czekania.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.n} className="relative card p-6 pt-8 space-y-2 hover:shadow-md transition-shadow">
              <span className="absolute -top-5 left-6 grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand-700 to-brand-500 text-white font-black shadow-lg">
                {s.n}
              </span>
              <h3 className="font-bold text-brand-950">{s.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{s.desc}</p>
              {i < 2 && (
                <span className="hidden md:block absolute top-1/2 -right-4 text-slate-300 text-2xl font-black" aria-hidden>
                  →
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ---------- FEATURES ---------- */}
      <section className="reveal space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-black text-brand-950">
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
              className="card p-6 space-y-3 hover:shadow-lg hover:-translate-y-0.5 transition-all"
            >
              <span
                className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${f.tile} text-2xl`}
              >
                {f.icon}
              </span>
              <h3 className="font-bold text-brand-950">{f.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- PORÓWNANIE ---------- */}
      <section className="reveal space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-black text-brand-950">
            Rezerwacja bezpośrednia się opłaca
          </h2>
          <p className="text-slate-500">
            Przy 100 000 zł obrotu rocznie portale zabierają 15–25 tys. zł. Hostimo —
            od 0 do 1188 zł.
          </p>
        </div>
        <div className="card overflow-hidden max-w-3xl mx-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="px-5 py-3.5 font-medium text-slate-500 w-2/5"></th>
                <th className="px-5 py-3.5 font-black text-brand-800 bg-brand-50">
                  host<span className="text-brand-600">imo</span>
                </th>
                <th className="px-5 py-3.5 font-semibold text-slate-500">Portale OTA</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map(([label, us, them]) => (
                <tr key={label} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-3 font-medium text-slate-700">{label}</td>
                  <td className="px-5 py-3 bg-brand-50/60 font-semibold text-brand-900">
                    ✓ {us}
                  </td>
                  <td className="px-5 py-3 text-slate-500">✕ {them}</td>
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
            <h2 className="text-3xl font-black text-brand-950">Obiekty na Hostimo</h2>
            <p className="text-slate-500 text-sm mt-1">
              Rezerwuj bezpośrednio — wspierasz obiekt, nie pośrednika.
            </p>
          </div>
        </div>
        {properties.length === 0 && (
          <p className="card px-6 py-10 text-center text-slate-500">
            Nie ma jeszcze żadnych obiektów.{" "}
            <Link href="/rejestracja" className="text-brand-700 font-semibold hover:underline">
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
                className="group card overflow-hidden flex flex-col hover:border-brand-500 hover:shadow-lg transition-all"
              >
                {p.photos[0] ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={p.photos[0].path}
                    alt={p.name}
                    className="h-44 w-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                  />
                ) : (
                  <div className="h-32 bg-gradient-to-br from-brand-100 via-brand-50 to-accent-100 grid place-items-center text-4xl">
                    🏨
                  </div>
                )}
                <div className="p-5 space-y-2 flex-1 flex flex-col">
                  <h3 className="font-bold text-lg text-brand-950">{p.name}</h3>
                  {p.address && (
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                      📍 {p.address}
                    </p>
                  )}
                  <p className="text-sm text-slate-600 flex-1 line-clamp-2">{p.description}</p>
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-brand-700">
                      od {formatPln(minPrice)}{" "}
                      <span className="text-sm font-medium text-slate-400">/ noc</span>
                    </p>
                    <span className="text-sm font-semibold text-brand-700 opacity-0 group-hover:opacity-100 transition-opacity">
                      Zobacz →
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ---------- OPINIE ---------- */}
      <section className="reveal space-y-8">
        <h2 className="text-3xl font-black text-brand-950 text-center">
          Właściciele o Hostimo
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          {QUOTES.map((q) => (
            <figure key={q.who} className="card p-6 space-y-4 flex flex-col">
              <p className="text-accent-500 text-lg tracking-widest" aria-hidden>
                ★★★★★
              </p>
              <blockquote className="text-sm text-slate-700 leading-relaxed flex-1">
                „{q.text}”
              </blockquote>
              <figcaption className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-brand-600 to-brand-400 text-white font-bold">
                  {q.who[0]}
                </span>
                <span>
                  <span className="block text-sm font-bold text-brand-950">{q.who}</span>
                  <span className="block text-xs text-slate-500">{q.role}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ---------- CENNIK ---------- */}
      <section id="cennik" className="reveal space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-black text-brand-950">Prosty cennik, zero prowizji</h2>
          <p className="text-slate-500">
            Płacisz za system, nie za sukces. Każda rezerwacja jest w 100% Twoja.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.key}
              className={`card p-7 flex flex-col space-y-4 transition-all hover:shadow-lg ${
                p.highlighted
                  ? "border-brand-600 border-2 shadow-lg relative md:scale-[1.03]"
                  : ""
              }`}
            >
              {p.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-brand-700 to-brand-500 text-white text-xs font-bold rounded-full px-4 py-1 shadow">
                  Najczęściej wybierany
                </span>
              )}
              <div>
                <h3 className="font-bold text-lg text-brand-950">{p.label}</h3>
                <p className="text-sm text-slate-500">{p.blurb}</p>
              </div>
              <p className="text-5xl font-black text-brand-950">
                {p.priceZl}
                <span className="text-base font-semibold text-slate-400"> zł/mc</span>
              </p>
              <ul className="text-sm text-slate-600 space-y-2.5 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-brand-600 font-bold">✓</span> {f}
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
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="faq" className="reveal space-y-8 max-w-3xl mx-auto w-full">
        <h2 className="text-3xl font-black text-brand-950 text-center">
          Najczęstsze pytania
        </h2>
        <div className="space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="faq card overflow-hidden">
              <summary className="cursor-pointer select-none px-6 py-4 font-semibold text-brand-950 hover:bg-brand-50 transition-colors list-none">
                {f.q}
              </summary>
              <p className="px-6 pb-5 pt-1 text-sm text-slate-600 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="reveal">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600 px-8 py-14 text-center text-white shadow-xl">
          <div className="aurora-blob h-72 w-72 bg-accent-500/60 -top-20 left-1/4" />
          <div className="absolute inset-0 grid-pattern" />
          <div className="relative space-y-4">
            <h2 className="text-3xl sm:text-4xl font-black">
              Gotowy na rezerwacje <span className="text-gradient">bez prowizji</span>?
            </h2>
            <p className="text-brand-100/90 max-w-xl mx-auto">
              Załóż konto, dodaj pokoje i cennik — Twoja strona rezerwacji ruszy w pół
              godziny. Plan Start jest darmowy bezterminowo.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Link href="/rejestracja" className="btn-accent px-8 py-3.5 text-base">
                Zarejestruj obiekt za darmo
              </Link>
              <form action={demoLogin}>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center border border-white/30 bg-white/5 hover:bg-white/15 text-white font-semibold rounded-xl px-7 py-3.5 text-base transition-colors"
                >
                  Zobacz demo panelu →
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
