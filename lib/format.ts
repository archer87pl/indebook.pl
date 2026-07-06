const plnFormatter = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Kwoty trzymamy w groszach (int). */
export function formatPln(grosze: number): string {
  return plnFormatter.format(grosze / 100);
}

/** Polska odmiana: 1 noc, 2 noce, 5 nocy, 22 noce… */
export function plNights(n: number): string {
  if (n === 1) return "1 noc";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} noce`;
  return `${n} nocy`;
}

/** "350" lub "350,50" (zł) -> grosze; NaN gdy niepoprawne */
export function parsePlnToGr(input: string): number {
  const normalized = input.trim().replace(/\s/g, "").replace(",", ".");
  const zl = Number(normalized);
  if (!Number.isFinite(zl) || zl < 0) return NaN;
  return Math.round(zl * 100);
}
