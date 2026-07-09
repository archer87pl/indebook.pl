// Opinie gości po pobycie: stałe i czyste helpery (bez dostępu do bazy).

import { todayISO } from "./dates";
import { appUrl } from "./payments";

export const REVIEW_MAX = 1000;

export function reviewUrl(code: string): string {
  return `${appUrl()}/r/${code}/opinia`;
}

export function isValidRating(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 5;
}

/** Publiczny podpis autora: imię + inicjał nazwiska (minimalizacja danych). */
export function displayAuthor(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Gość";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** Średnia ocen zaokrąglona do 1 miejsca; 0 gdy brak opinii. */
export function averageRating(ratings: number[]): number {
  if (ratings.length === 0) return 0;
  const sum = ratings.reduce((a, b) => a + b, 0);
  return Math.round((sum / ratings.length) * 10) / 10;
}

/** Gwiazdki tekstowe do wyświetlenia, np. ★★★★☆. */
export function stars(rating: number): string {
  const n = Math.max(0, Math.min(5, Math.round(rating)));
  return "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);
}

/**
 * Opinię można wystawić po zakończonym pobycie (potwierdzona rezerwacja,
 * dzień wymeldowania minął), o ile jeszcze jej nie ma.
 */
export function canReview(r: {
  status: string;
  checkOut: string;
  hasReview: boolean;
}): boolean {
  return r.status === "CONFIRMED" && r.checkOut <= todayISO() && !r.hasReview;
}
