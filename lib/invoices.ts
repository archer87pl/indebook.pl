// Faktury: stałe i czyste helpery (bez dostępu do bazy). Kwoty w groszach.

export const INVOICE_KINDS = [
  { key: "KONCOWA", label: "Faktura VAT", prefix: "FV" },
  { key: "ZALICZKOWA", label: "Faktura zaliczkowa", prefix: "FZ" },
  { key: "PROFORMA", label: "Faktura proforma", prefix: "PRO" },
];

export const VAT_RATES = [8, 23, 5, 0]; // usługa noclegowa w PL = 8%

export function invoiceKindDef(key: string) {
  return INVOICE_KINDS.find((k) => k.key === key);
}

export function invoiceNumber(kind: string, seq: number, year: number): string {
  const prefix = invoiceKindDef(kind)?.prefix ?? "FV";
  return `${prefix} ${seq}/${year}`;
}

/**
 * Rozbicie kwoty brutto na netto + VAT dla danej stawki (brutto = źródło prawdy,
 * bo ceny w systemie są brutto). Zaokrąglenie do grosza, VAT = brutto − netto.
 */
export function splitGross(grossGr: number, vatRate: number): {
  netGr: number;
  vatGr: number;
} {
  const netGr = Math.round((grossGr * 100) / (100 + vatRate));
  return { netGr, vatGr: grossGr - netGr };
}

export function isValidVatRate(rate: number): boolean {
  return VAT_RATES.includes(rate);
}
