// Konfiguracja platformy (bramki/integracje) edytowana w /superadmin/ustawienia.
// Odczyt: wartość z bazy (PlatformSetting) ma pierwszeństwo, zmienna
// środowiskowa o tym samym kluczu jest fallbackiem. Odczyty są cache'owane
// per request (react cache), więc wiele getSetting() w jednym renderze
// kosztuje jedno zapytanie.

import { cache } from "react";
import { prisma } from "./db";

export type SettingDef = {
  key: string;
  label: string;
  /** sekret — w UI pokazujemy tylko końcówkę, input nie prefilluje wartości */
  secret: boolean;
  placeholder?: string;
  hint?: string;
};

export type SettingSection = {
  id: string;
  title: string;
  description: string;
  /** klucze, których komplet oznacza „skonfigurowano” (podzbiór fields) */
  requiredKeys: string[];
  fields: SettingDef[];
};

// Płatności (Przelewy24) nie są ustawieniem platformy — każdy obiekt podpina
// własne konto P24 w /admin/platnosci/konfiguracja (pola Property.p24*).
export const SETTING_SECTIONS: SettingSection[] = [
  {
    id: "mail",
    title: "E-maile — Resend",
    description:
      "Potwierdzenia, meldunek, czat, przypomnienia. Bez klucza wiadomości trafiają tylko do logu konsoli serwera.",
    requiredKeys: ["RESEND_API_KEY"],
    fields: [
      { key: "RESEND_API_KEY", label: "Klucz API", secret: true, placeholder: "re_…" },
      {
        key: "EMAIL_FROM",
        label: "Nadawca",
        secret: false,
        placeholder: "Rezio <rezerwacje@twojadomena.pl>",
        hint: "domena nadawcy musi być zweryfikowana w Resend",
      },
    ],
  },
  {
    id: "sms",
    title: "SMS-y — SMSAPI",
    description:
      "Potwierdzenia rezerwacji i przypomnienia dzień przed przyjazdem (wysyłka 8–21). Bez tokenu SMS-y trafiają do logu konsoli.",
    requiredKeys: ["SMSAPI_TOKEN"],
    fields: [
      { key: "SMSAPI_TOKEN", label: "Token OAuth", secret: true },
      {
        key: "SMS_FROM",
        label: "Pole nadawcy",
        secret: false,
        placeholder: "ECO",
        hint: "zarejestrowany nadpis w SMSAPI; „ECO” = SMS ekonomiczny bez nadpisu",
      },
    ],
  },
];

export const KNOWN_SETTING_KEYS = SETTING_SECTIONS.flatMap((s) =>
  s.fields.map((f) => f.key),
);

/** Wszystkie nadpisania z bazy — jedno zapytanie na request. */
export const getDbSettings = cache(async (): Promise<Record<string, string>> => {
  const rows = await prisma.platformSetting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
});

/** Efektywna wartość ustawienia: baza (panel) → ENV → "". */
export async function getSetting(key: string): Promise<string> {
  const db = await getDbSettings();
  return db[key] ?? process.env[key] ?? "";
}

/** Skąd pochodzi efektywna wartość (do statusów w UI). */
export async function settingSource(key: string): Promise<"panel" | "env" | null> {
  const db = await getDbSettings();
  if (db[key] !== undefined && db[key] !== "") return "panel";
  if (process.env[key]) return "env";
  return null;
}

/** Maska sekretu do UI: „••••1234” (nie ujawniamy pełnej wartości). */
export function maskSecret(value: string): string {
  if (!value) return "";
  return `••••${value.slice(-4)}`;
}
