// Daty pobytu trzymamy jako stringi "YYYY-MM-DD" (bez stref czasowych).
// Przedziały pobytów i blokad są półotwarte: [checkIn, checkOut).

export const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidISO(s: string): boolean {
  if (!ISO_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function nightsBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Kolejne noce pobytu: [from, to) */
export function eachNight(from: string, to: string): string[] {
  const nights: string[] = [];
  for (let d = from; d < to; d = addDaysISO(d, 1)) nights.push(d);
  return nights;
}

/** Wszystkie dni miesiąca "YYYY-MM" jako daty ISO. */
export function monthDays(month: string): string[] {
  const days: string[] = [];
  for (let d = `${month}-01`; d.slice(0, 7) === month; d = addDaysISO(d, 1)) {
    days.push(d);
  }
  return days;
}

/** Przesuwa "YYYY-MM" o delta miesięcy. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function formatDatePl(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatDateShortPl(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
