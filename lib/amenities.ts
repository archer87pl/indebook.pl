export type AmenityDef = { key: string; label: string; icon: string };

export const AMENITIES: AmenityDef[] = [
  { key: "wifi", label: "Wi-Fi", icon: "📶" },
  { key: "tv", label: "TV", icon: "📺" },
  { key: "ac", label: "Klimatyzacja", icon: "❄️" },
  { key: "heating", label: "Ogrzewanie", icon: "🔥" },
  { key: "private-bathroom", label: "Prywatna łazienka", icon: "🚿" },
  { key: "kitchenette", label: "Aneks kuchenny", icon: "🍳" },
  { key: "fridge", label: "Lodówka", icon: "🧊" },
  { key: "kettle", label: "Czajnik / kawa i herbata", icon: "☕" },
  { key: "balcony", label: "Balkon / taras", icon: "🌤️" },
  { key: "view", label: "Widok (jezioro/góry/morze)", icon: "🏞️" },
  { key: "parking", label: "Parking", icon: "🅿️" },
  { key: "pets", label: "Zwierzęta mile widziane", icon: "🐾" },
  { key: "crib", label: "Łóżeczko dla dziecka", icon: "🍼" },
  { key: "workspace", label: "Miejsce do pracy", icon: "💻" },
  { key: "washer", label: "Pralka", icon: "🌀" },
  { key: "accessible", label: "Dostępny dla osób z niepełnosprawnością", icon: "♿" },
];

export function amenityDef(key: string): AmenityDef | undefined {
  return AMENITIES.find((a) => a.key === key);
}

/** Bezpieczny parse kolumny UnitType.amenities (JSON string). */
export function parseAmenities(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr)
      ? arr.filter((k) => typeof k === "string" && amenityDef(k))
      : [];
  } catch {
    return [];
  }
}
