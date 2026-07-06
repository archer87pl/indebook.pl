import { createHash } from "node:crypto";
import type { Reservation } from "@prisma/client";

// Przelewy24 REST API v1 (https://developers.przelewy24.pl).
// Brak kompletu zmiennych P24_* => tryb symulacji (przycisk potwierdza od razu).

type P24Config = {
  merchantId: number;
  posId: number;
  apiKey: string;
  crc: string;
  baseUrl: string;
};

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3001").replace(/\/$/, "");
}

function config(): P24Config | null {
  const { P24_MERCHANT_ID, P24_POS_ID, P24_API_KEY, P24_CRC } = process.env;
  if (!P24_MERCHANT_ID || !P24_POS_ID || !P24_API_KEY || !P24_CRC) return null;
  const sandbox = process.env.P24_SANDBOX !== "false";
  return {
    merchantId: Number(P24_MERCHANT_ID),
    posId: Number(P24_POS_ID),
    apiKey: P24_API_KEY,
    crc: P24_CRC,
    baseUrl: sandbox
      ? "https://sandbox.przelewy24.pl"
      : "https://secure.przelewy24.pl",
  };
}

export function p24Configured(): boolean {
  return config() !== null;
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
  propertyName: string
): Promise<string> {
  const cfg = config();
  if (!cfg) throw new Error("P24 nie jest skonfigurowane.");

  const body = {
    merchantId: cfg.merchantId,
    posId: cfg.posId,
    sessionId: reservation.code,
    amount: reservation.depositGr,
    currency: "PLN",
    description: `Zaliczka za rezerwację ${reservation.code} — ${propertyName}`,
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

/** Weryfikuje podpis powiadomienia urlStatus. */
export function verifyP24NotificationSign(n: P24Notification): boolean {
  const cfg = config();
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
  return expected === n.sign;
}

/** Potwierdza transakcję w P24 (wymagane, żeby środki zostały zaksięgowane). */
export async function verifyP24Transaction(n: P24Notification): Promise<boolean> {
  const cfg = config();
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
