import { createHash } from "node:crypto";
import type { Property, Reservation } from "@prisma/client";
import { safeEqual } from "./password";

// Przelewy24 REST API v1 (https://developers.przelewy24.pl).
// Konfiguracja per obiekt (Property.p24*) — właściciel ma własną umowę z P24,
// zaliczki gości trafiają bezpośrednio na jego konto, on rozlicza prowizję
// bramki. Brak kompletu danych => tryb symulacji (przycisk potwierdza od razu).

export type P24Fields = Pick<
  Property,
  "p24MerchantId" | "p24PosId" | "p24ApiKey" | "p24Crc" | "p24Sandbox"
>;

export type P24Config = {
  merchantId: number;
  posId: number;
  apiKey: string;
  crc: string;
  baseUrl: string;
};

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3001").replace(/\/$/, "");
}

export function p24Config(p: P24Fields): P24Config | null {
  if (!p.p24MerchantId || !p.p24PosId || !p.p24ApiKey || !p.p24Crc) return null;
  const merchantId = Number(p.p24MerchantId);
  const posId = Number(p.p24PosId);
  if (!Number.isInteger(merchantId) || !Number.isInteger(posId)) return null;
  return {
    merchantId,
    posId,
    apiKey: p.p24ApiKey,
    crc: p.p24Crc,
    baseUrl: p.p24Sandbox
      ? "https://sandbox.przelewy24.pl"
      : "https://secure.przelewy24.pl",
  };
}

export function p24Configured(p: P24Fields): boolean {
  return p24Config(p) !== null;
}

function sign(payload: Record<string, unknown>, crc: string): string {
  return createHash("sha384")
    .update(JSON.stringify({ ...payload, crc }))
    .digest("hex");
}

function authHeader(cfg: P24Config): string {
  return `Basic ${Buffer.from(`${cfg.posId}:${cfg.apiKey}`).toString("base64")}`;
}

/** Rejestruje transakcję zaliczki; zwraca URL bramki do przekierowania gościa. */
export async function createP24Payment(
  reservation: Reservation,
  property: P24Fields & { name: string }
): Promise<string> {
  const cfg = p24Config(property);
  if (!cfg) throw new Error("P24 nie jest skonfigurowane.");

  const body = {
    merchantId: cfg.merchantId,
    posId: cfg.posId,
    sessionId: reservation.code,
    amount: reservation.depositGr,
    currency: "PLN",
    description: `Zaliczka za rezerwację ${reservation.code} — ${property.name}`,
    email: reservation.email,
    client: reservation.guestName,
    country: "PL",
    language: "pl",
    urlReturn: `${appUrl()}/r/${reservation.code}?paid=1`,
    urlStatus: `${appUrl()}/api/payments/p24`,
    sign: sign(
      {
        sessionId: reservation.code,
        merchantId: cfg.merchantId,
        amount: reservation.depositGr,
        currency: "PLN",
      },
      cfg.crc
    ),
  };

  const res = await fetch(`${cfg.baseUrl}/api/v1/transaction/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader(cfg) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json()) as { data?: { token?: string }; error?: string };
  if (!res.ok || !json.data?.token)
    throw new Error(`P24 register: ${json.error ?? `HTTP ${res.status}`}`);
  return `${cfg.baseUrl}/trnRequest/${json.data.token}`;
}

export type P24Notification = {
  merchantId: number;
  posId: number;
  sessionId: string;
  amount: number;
  originAmount: number;
  currency: string;
  orderId: number;
  methodId: number;
  statement: string;
  sign: string;
};

/** Weryfikuje podpis powiadomienia urlStatus kluczem CRC obiektu. */
export function verifyP24NotificationSign(
  n: P24Notification,
  property: P24Fields
): boolean {
  const cfg = p24Config(property);
  if (!cfg) return false;
  const expected = sign(
    {
      merchantId: n.merchantId,
      posId: n.posId,
      sessionId: n.sessionId,
      amount: n.amount,
      originAmount: n.originAmount,
      currency: n.currency,
      orderId: n.orderId,
      methodId: n.methodId,
      statement: n.statement,
    },
    cfg.crc
  );
  return safeEqual(expected, n.sign);
}

/** Potwierdza transakcję w P24 (wymagane, żeby środki zostały zaksięgowane). */
export async function verifyP24Transaction(
  n: P24Notification,
  property: P24Fields
): Promise<boolean> {
  const cfg = p24Config(property);
  if (!cfg) return false;
  const res = await fetch(`${cfg.baseUrl}/api/v1/transaction/verify`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: authHeader(cfg) },
    body: JSON.stringify({
      merchantId: cfg.merchantId,
      posId: cfg.posId,
      sessionId: n.sessionId,
      amount: n.amount,
      currency: n.currency,
      orderId: n.orderId,
      sign: sign(
        {
          sessionId: n.sessionId,
          orderId: n.orderId,
          amount: n.amount,
          currency: n.currency,
        },
        cfg.crc
      ),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  return res.ok;
}

/** Sprawdza poprawność danych dostępowych (P24 /testAccess). */
export async function testP24Access(property: P24Fields): Promise<boolean> {
  const cfg = p24Config(property);
  if (!cfg) return false;
  try {
    const res = await fetch(`${cfg.baseUrl}/api/v1/testAccess`, {
      headers: { Authorization: authHeader(cfg) },
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
