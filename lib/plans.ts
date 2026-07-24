export type PlanDef = {
  key: string;
  label: string;
  priceZl: number;
  blurb: string;
  maxUnits: number | null; // null = bez limitu
  features: string[];
  highlighted?: boolean;
};

export const PLANS: PlanDef[] = [
  {
    key: "FREE",
    label: "Start",
    priceZl: 0,
    blurb: "Dla małych obiektów, które zaczynają sprzedaż online.",
    maxUnits: 3,
    features: [
      "do 3 jednostek (pokoi/apartamentów)",
      "strona obiektu z rezerwacją online",
      "kalendarz i rezerwacje ręczne",
      "panel gościa (zmiana terminu, anulowanie)",
      "opinie gości z odpowiedziami",
      "e-maile do gości",
    ],
  },
  {
    key: "STANDARD",
    label: "Standard",
    priceZl: 79,
    blurb: "Pełny warsztat recepcji — bez prowizji od rezerwacji.",
    maxUnits: 15,
    features: [
      "do 15 jednostek",
      "wszystko z planu Start",
      "channel manager iCal (Booking.com, Airbnb)",
      "płatności online (BLIK, karty)",
      "meldunek online z e-podpisem",
      "czat z gościem i SMS-y",
      "kody promocyjne i cennik sezonowy",
      "własna strona WWW obiektu (subdomena)",
    ],
    highlighted: true,
  },
  {
    key: "PRO",
    label: "Pro",
    priceZl: 149,
    blurb: "Dla większych obiektów — automatyzacja i pełna analityka.",
    maxUnits: null,
    features: [
      "jednostki bez limitu",
      "wszystko z planu Standard",
      "ceny dynamiczne (weekend, last minute, obłożenie)",
      "faktury VAT / zaliczkowe / proforma",
      "raporty przychodów i obłożenia per kanał",
      "eksport CSV do księgowości",
      "własna domena strony WWW (mojobiekt.pl)",
      "priorytetowe wsparcie",
    ],
  },
];

export function planDef(key: string): PlanDef {
  return PLANS.find((p) => p.key === key) ?? PLANS[0];
}

// Synchronizacja kanałów: iCal od Standard, Channex (2-way) tylko w Pro.
export function channelSyncFeatures(plan: string): { ical: boolean; channex: boolean } {
  return { ical: plan === "STANDARD" || plan === "PRO", channex: plan === "PRO" };
}

// Moduł „Strona WWW": kreator + subdomena od planu Standard, własna domena w Pro.
export function sitePlanFeatures(plan: string): {
  builder: boolean;
  customDomain: boolean;
} {
  return {
    builder: plan === "STANDARD" || plan === "PRO",
    customDomain: plan === "PRO",
  };
}
