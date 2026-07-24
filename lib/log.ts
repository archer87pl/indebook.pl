// Dziennik zdarzeń platformy (EventLog) — widoczny w /superadmin/logi.
// logEvent nigdy nie rzuca: awaria logowania nie może wywrócić operacji
// biznesowej (rezerwacji, płatności, wysyłki).

import { prisma } from "./db";

export type EventKind =
  | "RESERVATION"
  | "PAYMENT"
  | "MAIL"
  | "SMS"
  | "ICAL"
  | "CHANNEX"
  | "ADMIN"
  | "AUTH";

export const EVENT_KINDS: { key: EventKind; label: string }[] = [
  { key: "RESERVATION", label: "Rezerwacje" },
  { key: "PAYMENT", label: "Płatności" },
  { key: "MAIL", label: "E-maile" },
  { key: "SMS", label: "SMS-y" },
  { key: "ICAL", label: "iCal" },
  { key: "CHANNEX", label: "Channex" },
  { key: "ADMIN", label: "Akcje admina" },
  { key: "AUTH", label: "Logowania" },
];

export async function logEvent(event: {
  kind: EventKind;
  message: string;
  level?: "INFO" | "WARN" | "ERROR";
  propertyId?: number | null;
  meta?: string;
}): Promise<void> {
  try {
    await prisma.eventLog.create({
      data: {
        kind: event.kind,
        message: event.message.slice(0, 500),
        level: event.level ?? "INFO",
        propertyId: event.propertyId ?? null,
        meta: (event.meta ?? "").slice(0, 500),
      },
    });
  } catch (e) {
    console.error("[LOG] nie udało się zapisać zdarzenia:", e);
  }
}
