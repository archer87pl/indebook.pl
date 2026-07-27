// Obiekty rozliczają się w złotówkach niezależnie od języka gościa, ale ZAPIS
// kwoty jest już językowy: „1234,00 zł" po polsku, „1.234,00 zł" po niemiecku,
// „PLN 1,234.00" po angielsku. Formattery są drogie w tworzeniu, więc trzymamy
// je w cache per język.
const moneyFormatters = new Map<string, Intl.NumberFormat>();

function moneyFormatter(locale: string): Intl.NumberFormat {
  let formatter = moneyFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "PLN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    moneyFormatters.set(locale, formatter);
  }
  return formatter;
}

/** Kwota w zapisie danego języka. Kwoty trzymamy w groszach (int). */
export function formatMoney(grosze: number, locale: string): string {
  return moneyFormatter(locale).format(grosze / 100);
}

/** Kwota po polsku — panel recepcji, faktury, maile do właściciela. */
export function formatPln(grosze: number): string {
  return formatMoney(grosze, "pl-PL");
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
