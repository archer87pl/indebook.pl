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
      "e-maile do gości",
    ],
  },
  {
    key: "STANDARD",
    label: "Standard",
    priceZl: 49,
    blurb: "Pełny warsztat recepcji — bez prowizji od rezerwacji.",
    maxUnits: 15,
    features: [
      "do 15 jednostek",
      "wszystko z planu Start",
      "channel manager iCal (Booking.com, Airbnb)",
      "płatności online (BLIK, karty)",
      "kody promocyjne i cennik sezonowy",
    ],
    highlighted: true,
  },
  {
    key: "PRO",
    label: "Pro",
    priceZl: 99,
    blurb: "Dla większych obiektów i pełnej analityki.",
    maxUnits: null,
    features: [
      "jednostki bez limitu",
      "wszystko z planu Standard",
      "raporty przychodów i obłożenia per kanał",
      "eksport CSV do księgowości",
      "priorytetowe wsparcie",
    ],
  },
];

export function planDef(key: string): PlanDef {
  return PLANS.find((p) => p.key === key) ?? PLANS[0];
}
