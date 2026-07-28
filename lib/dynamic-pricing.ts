// Ceny dynamiczne: reguły per obiekt (PricingRule) nakładane na cennik
// statyczny (baza/sezony). Ta warstwa zna bazę; czysta arytmetyka korekt
// jest w lib/pricing.ts. Używać we WSZYSTKICH ścieżkach wyceny widocznych
// dla gościa, żeby wyniki wyszukiwania i rezerwacja pokazywały tę samą cenę.

import type { RateSeason, UnitType } from "@prisma/client";
import { conflictingReservationWhere } from "./availability";
import { eachNight, todayISO } from "./dates";
import { prisma } from "./db";
import {
  applyAdjustment,
  nightAdjustmentPercent,
  quoteStay,
  type Quote,
} from "./pricing";
import { pricingPlanFeatures } from "./plans";
import { cachedRates } from "./rates/cache";
import { afterRates } from "./rates/refresh";

export const PRICING_RULE_KINDS = [
  {
    key: "WEEKEND",
    label: "Weekend",
    hint: "Korekta ceny nocy piątkowych i sobotnich.",
    paramLabel: null as string | null,
    defaultPercent: 15,
    defaultParam: 0,
  },
  {
    key: "LAST_MINUTE",
    label: "Last minute",
    hint: "Korekta ceny nocy wypadających w najbliższych dniach (zwykle rabat, żeby domknąć luki).",
    paramLabel: "Dni do przyjazdu",
    defaultPercent: -10,
    defaultParam: 7,
  },
  {
    key: "OCCUPANCY",
    label: "Wysokie obłożenie",
    hint: "Korekta ceny nocy, w których obłożenie tego typu pokoju osiąga próg.",
    paramLabel: "Próg obłożenia (%)",
    defaultPercent: 10,
    defaultParam: 80,
  },
];

/** Obłożenie typu pokoju per noc w [from, to), w % (rezerwacje + blokady). */
export async function unitTypeOccupancy(
  unitTypeId: number,
  from: string,
  to: string,
  excludeReservationId?: number
): Promise<Map<string, number>> {
  const units = await prisma.unit.findMany({
    where: { unitTypeId, active: true },
    include: {
      reservations: {
        where: conflictingReservationWhere(from, to, excludeReservationId),
      },
      blocks: { where: { startDate: { lt: to }, endDate: { gt: from } } },
    },
  });
  const map = new Map<string, number>();
  for (const night of eachNight(from, to)) {
    if (units.length === 0) {
      map.set(night, 0);
      continue;
    }
    const occupied = units.filter(
      (u) =>
        u.reservations.some((r) => r.checkIn <= night && night < r.checkOut) ||
        u.blocks.some((b) => b.startDate <= night && night < b.endDate)
    ).length;
    map.set(night, Math.round((occupied / units.length) * 100));
  }
  return map;
}

/** Podmiana cen nocy na rekomendacje z cache'u; reszta wyceny bez zmian. */
export function applyCachedRates(
  base: Quote,
  priceByDate: Map<string, number>,
  depositPercent: number
): Quote {
  const nightly = base.nightly.map(({ date, priceGr }) => ({
    date,
    priceGr: priceByDate.get(date) ?? priceGr,
  }));
  const totalGr = nightly.reduce((sum, n) => sum + n.priceGr, 0);
  return {
    ...base,
    nightly,
    totalGr,
    depositGr: Math.round((totalGr * depositPercent) / 100),
  };
}

/**
 * Wycena pobytu z regułami cen dynamicznych obiektu.
 * Bez aktywnych reguł zwraca wycenę statyczną (zero dodatkowych zapytań
 * poza odczytem reguł). excludeReservationId: przy zmianie terminu własna
 * rezerwacja nie powinna podbijać sobie obłożenia.
 */
export async function quoteStayDynamic(
  unitType: UnitType & { seasons: RateSeason[] },
  from: string,
  to: string,
  depositPercent: number,
  excludeReservationId?: number
): Promise<Quote> {
  const base = quoteStay(unitType, from, to, depositPercent);

  // Tryb SMARTRATE: ceny z cache'u. Zasada „wszystko albo nic" — brak choćby
  // jednej nocy degraduje CAŁĄ wycenę do reguł, żeby gość nigdy nie zobaczył
  // ceny sklejonej z dwóch silników (ta sama reguła co przy push-u ARI).
  const property = await prisma.property.findUnique({
    where: { id: unitType.propertyId },
    select: { plan: true, pricingMode: true, smartRateMarketId: true },
  });
  if (
    property?.pricingMode === "SMARTRATE" &&
    pricingPlanFeatures(property.plan).smartRate &&
    property.smartRateMarketId
  ) {
    const cached = await cachedRates(unitType.id, from, to);
    if (cached.complete && !cached.stale) {
      return applyCachedRates(base, cached.priceByDate, depositPercent);
    }
    await afterRates(unitType.id, from, to);
    if (cached.complete) {
      // nieświeże, ale kompletne — obsługujemy gościa, świeże dociągnie after()
      return applyCachedRates(base, cached.priceByDate, depositPercent);
    }
  }

  const rules = await prisma.pricingRule.findMany({
    where: { propertyId: unitType.propertyId, active: true, percent: { not: 0 } },
  });
  if (rules.length === 0) return base;

  const occupancy = rules.some((r) => r.kind === "OCCUPANCY")
    ? await unitTypeOccupancy(unitType.id, from, to, excludeReservationId)
    : new Map<string, number>();
  const today = todayISO();
  const nightly = base.nightly.map(({ date, priceGr }) => ({
    date,
    priceGr: applyAdjustment(
      priceGr,
      nightAdjustmentPercent(rules, date, today, occupancy.get(date) ?? 0)
    ),
  }));
  const totalGr = nightly.reduce((sum, n) => sum + n.priceGr, 0);
  return {
    ...base,
    nightly,
    totalGr,
    depositGr: Math.round((totalGr * depositPercent) / 100),
  };
}

/**
 * Ceny poszczególnych dób w [from, to) — dla push-u ARI do kanałów.
 * Świadomie przechodzi przez quoteStayDynamic, żeby kanał dostawał DOKŁADNIE
 * tę stawkę, którą widzi gość na naszej stronie (łącznie z trybem SmartRate
 * i degradacją do reguł). Zaliczka jest tu nieistotna, stąd 0.
 */
export async function nightlyRates(
  unitType: UnitType & { seasons: RateSeason[] },
  from: string,
  to: string
): Promise<Map<string, number>> {
  if (from >= to) return new Map();
  const quote = await quoteStayDynamic(unitType, from, to, 0);
  return new Map(quote.nightly.map((n) => [n.date, n.priceGr]));
}
