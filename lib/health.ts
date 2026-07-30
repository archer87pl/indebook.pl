import { prisma } from "./db";
import { p24Configured } from "./payments";
import { channelSyncFeatures, pricingPlanFeatures, sitePlanFeatures } from "./plans";

/**
 * Gotowość obiektu do sprzedaży — lista rzeczy, które właściciel ma uzupełnić,
 * z postępem w procentach.
 *
 * Zasady, na których stoi cały moduł:
 *  • pozycja NIEDOSTĘPNA w planie w ogóle nie wchodzi do wyniku — inaczej plan
 *    Free nigdy nie doszedłby do 100% i licznik przestałby cokolwiek znaczyć;
 *  • „krytyczne" to takie, bez których gość nie zarezerwuje albo obiekt traci
 *    pieniądze/łamie obowiązek prawny — reszta jest zalecana;
 *  • liczy się treść, nie samo wypełnienie pola: opis na trzy znaki i jedno
 *    zdjęcie przechodzą test „niepuste", a obiektu nie sprzedają.
 */

/** Zdjęć poniżej tylu galeria na stronie i w wyszukiwarce wygląda na pustą. */
export const MIN_PHOTOS = 3;
/** Krótszy opis nie odpowiada gościowi na żadne pytanie przed rezerwacją. */
export const MIN_DESCRIPTION = 120;

export type HealthItem = {
  key: string;
  label: string;
  /** Po co to jest — pokazywane przy pozycjach niezrobionych. */
  hint: string;
  href: string;
  done: boolean;
  critical: boolean;
};

export type HealthGroup = { key: string; title: string; items: HealthItem[] };

export type HealthReport = {
  groups: HealthGroup[];
  done: number;
  total: number;
  percent: number;
  /** Niezrobione, krytyczne na początku — gotowe do wypisania „co dalej". */
  missing: HealthItem[];
  criticalMissing: number;
};

/** Pola obiektu, od których zależy gotowość. */
export type HealthProperty = {
  plan: string;
  description: string;
  address: string;
  terms: string;
  privacyPolicy: string;
  arrivalInfo: string;
  sellerName: string;
  sellerNip: string;
  sellerAddress: string;
  bankAccount: string;
  p24MerchantId: string;
  p24PosId: string;
  p24ApiKey: string;
  p24Crc: string;
  p24Sandbox: boolean;
  syncMode: string;
  pricingMode: string;
  smartRateMarketId: string;
};

export type HealthInput = {
  property: HealthProperty;
  photoCount: number;
  unitTypeCount: number;
  activeUnitCount: number;
  /** Typy pokoi z ceną 0 — jeden taki wystarczy, żeby cennik był dziurawy. */
  unpricedUnitTypeCount: number;
  faqCount: number;
  icalFeedCount: number;
  channexActive: boolean;
  sitePublished: boolean;
};

const filled = (v: string) => v.trim().length > 0;

export function propertyHealth(input: HealthInput): HealthReport {
  const p = input.property;
  const site = sitePlanFeatures(p.plan);
  const sync = channelSyncFeatures(p.plan);

  const groups: HealthGroup[] = [];
  const add = (key: string, title: string, items: (HealthItem | null)[]) => {
    const present = items.filter((i): i is HealthItem => i !== null);
    if (present.length > 0) groups.push({ key, title, items: present });
  };

  add("oferta", "Oferta", [
    {
      key: "unitTypes",
      label: "Typy pokoi",
      hint: "Bez typu pokoju nie ma czego rezerwować.",
      href: "/admin/pokoje",
      done: input.unitTypeCount > 0,
      critical: true,
    },
    {
      key: "units",
      label: "Aktywne jednostki",
      hint: "Typ pokoju bez aktywnych jednostek pokazuje gościowi brak wolnych terminów.",
      href: "/admin/pokoje",
      done: input.activeUnitCount > 0,
      critical: true,
    },
    {
      key: "prices",
      label: "Ceny bazowe",
      hint: "Typ pokoju z ceną 0 zł sprzeda się za darmo.",
      href: "/admin/cennik",
      done: input.unitTypeCount > 0 && input.unpricedUnitTypeCount === 0,
      critical: true,
    },
    {
      key: "photos",
      label: `Zdjęcia (min. ${MIN_PHOTOS})`,
      hint: "Oferta bez zdjęć wypada z porównania, zanim gość przeczyta opis.",
      href: "/admin/obiekt",
      done: input.photoCount >= MIN_PHOTOS,
      critical: false,
    },
    {
      key: "description",
      label: "Opis obiektu",
      hint: `Kilka zdań (min. ${MIN_DESCRIPTION} znaków) o tym, co gość dostaje.`,
      href: "/admin/obiekt",
      done: p.description.trim().length >= MIN_DESCRIPTION,
      critical: false,
    },
    {
      key: "address",
      label: "Adres obiektu",
      hint: "Gość musi wiedzieć, gdzie ma przyjechać — adres idzie też do potwierdzenia.",
      href: "/admin/obiekt",
      done: filled(p.address),
      critical: true,
    },
  ]);

  add("pieniadze", "Płatności i faktury", [
    {
      key: "p24",
      label: "Przelewy24",
      hint: "Bez bramki rezerwacje potwierdzają się bez pobrania zaliczki.",
      href: "/admin/platnosci/konfiguracja",
      done: p24Configured(p),
      critical: true,
    },
    {
      key: "seller",
      label: "Dane sprzedawcy do faktur",
      hint: "Nazwa, NIP i adres — bez nich nie wystawisz faktury.",
      href: "/admin/obiekt",
      done: filled(p.sellerName) && filled(p.sellerNip) && filled(p.sellerAddress),
      critical: false,
    },
    {
      key: "bankAccount",
      label: "Numer konta",
      hint: "Potrzebny na fakturze i przy zwrotach zaliczki.",
      href: "/admin/obiekt",
      done: filled(p.bankAccount),
      critical: false,
    },
  ]);

  add("formalnosci", "Formalności", [
    {
      key: "terms",
      label: "Regulamin obiektu",
      hint: "Gość akceptuje go przy rezerwacji — bez treści akceptuje pustkę.",
      href: "/admin/obiekt",
      done: filled(p.terms),
      critical: true,
    },
    {
      key: "privacyPolicy",
      label: "Polityka prywatności",
      hint: "Obiekt przetwarza dane gości — RODO wymaga informacji.",
      href: "/admin/obiekt",
      done: filled(p.privacyPolicy),
      critical: true,
    },
    {
      key: "arrivalInfo",
      label: "Informacje na przyjazd",
      hint: "Dojazd, odbiór kluczy, parking — trafia do maila przed pobytem.",
      href: "/admin/obiekt",
      done: filled(p.arrivalInfo),
      critical: false,
    },
    {
      key: "faq",
      label: "Pytania i odpowiedzi",
      hint: "Kilka wpisów FAQ zdejmuje najczęstsze telefony do recepcji.",
      href: "/admin/obiekt",
      done: input.faqCount > 0,
      critical: false,
    },
  ]);

  add("widocznosc", "Widoczność", [
    site.builder
      ? {
          key: "site",
          label: "Opublikowana strona WWW",
          hint: "Kreator ma gotową wersję roboczą — publikacja daje obiektowi własny adres.",
          href: "/admin/strona",
          done: input.sitePublished,
          critical: false,
        }
      : null,
    sync.ical || sync.channex
      ? {
          key: "channels",
          label: "Synchronizacja kanałów",
          hint: "Bez niej terminy z Booking.com i Airbnb nie blokują dostępności.",
          href: "/admin/kanaly",
          done: channelsReady(p, input),
          critical: false,
        }
      : null,
    p.pricingMode === "SMARTRATE" && pricingPlanFeatures(p.plan).smartRate
      ? {
          key: "smartRate",
          label: "Rynek SmartRate",
          hint: "Wyceny dynamiczne bez wybranego rynku wracają do ceny bazowej.",
          href: "/admin/cennik",
          done: filled(p.smartRateMarketId),
          critical: false,
        }
      : null,
  ]);

  const items = groups.flatMap((g) => g.items);
  const done = items.filter((i) => i.done).length;
  const missing = items
    .filter((i) => !i.done)
    .sort((a, b) => Number(b.critical) - Number(a.critical));

  return {
    groups,
    done,
    total: items.length,
    // grupa „Oferta" nie zależy od planu, więc lista nigdy nie jest pusta
    percent: Math.round((done / items.length) * 100),
    missing,
    criticalMissing: missing.filter((i) => i.critical).length,
  };
}

/**
 * Sam wybór trybu nie wystarcza: iCal bez ani jednego kanału i Channex bez
 * aktywnego połączenia wyglądają w ustawieniach na włączone, a nie synchronizują.
 */
function channelsReady(p: HealthProperty, input: HealthInput): boolean {
  if (p.syncMode === "ICAL") return input.icalFeedCount > 0;
  if (p.syncMode === "CHANNEX") return input.channexActive;
  return false;
}

/** Dociąga liczniki, których nie ma w rekordzie obiektu, i liczy raport. */
export async function loadPropertyHealth(
  propertyId: number,
  property: HealthProperty,
): Promise<HealthReport> {
  const [
    photoCount,
    unitTypeCount,
    activeUnitCount,
    unpricedUnitTypeCount,
    faqCount,
    icalFeedCount,
    channex,
    site,
  ] = await prisma.$transaction([
    prisma.photo.count({ where: { propertyId } }),
    prisma.unitType.count({ where: { propertyId } }),
    prisma.unit.count({ where: { unitType: { propertyId }, active: true } }),
    prisma.unitType.count({ where: { propertyId, basePriceGr: { lte: 0 } } }),
    prisma.propertyFaq.count({ where: { propertyId } }),
    prisma.icalFeed.count({ where: { unit: { unitType: { propertyId } } } }),
    prisma.channexProperty.findUnique({ where: { propertyId }, select: { status: true } }),
    prisma.site.findUnique({ where: { propertyId }, select: { publishedAt: true } }),
  ]);

  return propertyHealth({
    property,
    photoCount,
    unitTypeCount,
    activeUnitCount,
    unpricedUnitTypeCount,
    faqCount,
    icalFeedCount,
    channexActive: channex?.status === "ACTIVE",
    sitePublished: site?.publishedAt != null,
  });
}
