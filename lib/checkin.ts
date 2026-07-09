// Meldunek online (karta meldunkowa): stałe i czyste helpery walidacji.
// Dane karty to PII — retencja w lib/jobs.ts (purgeExpiredCheckIns).

import { isValidISO, todayISO } from "./dates";
import { appUrl } from "./payments";

export const DOC_TYPES = [
  { key: "DOWOD", label: "Dowód osobisty" },
  { key: "PASZPORT", label: "Paszport" },
  { key: "INNY", label: "Inny dokument" },
];

export function docTypeLabel(key: string): string {
  return DOC_TYPES.find((d) => d.key === key)?.label ?? "nie podano";
}

// 12 miesięcy po wymeldowaniu — potem karta znika automatycznie
// (minimalizacja danych; okres pokrywa ewentualne roszczenia i rozliczenia).
export const CHECKIN_RETENTION_DAYS = 365;

export type AdditionalGuest = { name: string; birthDate: string };

/**
 * Dodatkowi goście z formularza (pola guestName_1..N / guestBirth_1..N).
 * Wiersz pusty jest pomijany; wiersz częściowo wypełniony to błąd.
 */
export function parseAdditionalGuests(
  formData: FormData,
  maxCount: number
): { guests: AdditionalGuest[]; error: string } {
  const guests: AdditionalGuest[] = [];
  for (let i = 1; i <= maxCount; i++) {
    const nameRaw = formData.get(`guestName_${i}`);
    const birthRaw = formData.get(`guestBirth_${i}`);
    const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
    const birthDate = typeof birthRaw === "string" ? birthRaw.trim() : "";
    if (!name && !birthDate) continue;
    if (name.length < 3)
      return { guests: [], error: `Gość ${i + 1}: podaj imię i nazwisko.` };
    if (birthDate && (!isValidISO(birthDate) || birthDate > todayISO()))
      return { guests: [], error: `Gość ${i + 1}: nieprawidłowa data urodzenia.` };
    guests.push({ name, birthDate });
  }
  return { guests, error: "" };
}

const SIGNATURE_PREFIX = "data:image/png;base64,";
const SIGNATURE_MAX_CHARS = 200_000; // ~150 KB PNG; mieści się w limicie 1 MB body

/** Podpis z canvasa: data URL PNG o sensownym rozmiarze i poprawnym nagłówku. */
export function isValidSignature(dataUrl: string): boolean {
  if (!dataUrl.startsWith(SIGNATURE_PREFIX)) return false;
  const b64 = dataUrl.slice(SIGNATURE_PREFIX.length);
  if (b64.length < 100 || b64.length > SIGNATURE_MAX_CHARS) return false;
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    return false;
  }
  // sygnatura formatu PNG: 89 50 4E 47
  return (
    buf.length > 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  );
}

/** Numer dokumentu do echa na listach: „AB…21" (pełny tylko na karcie). */
export function maskDocNumber(s: string): string {
  if (!s) return "—";
  if (s.length <= 4) return "•••";
  return `${s.slice(0, 2)}…${s.slice(-2)}`;
}

export function checkInUrl(code: string): string {
  return `${appUrl()}/r/${code}/meldunek`;
}

/** Meldunek online dostępny: rezerwacja potwierdzona, przed wymeldowaniem, bez karty. */
export function canCheckIn(r: {
  status: string;
  checkInStatus: string;
  checkOut: string;
}): boolean {
  return (
    r.status === "CONFIRMED" &&
    r.checkInStatus === "NONE" &&
    r.checkOut >= todayISO()
  );
}
