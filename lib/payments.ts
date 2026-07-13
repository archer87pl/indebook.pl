import { createHash } from "node:crypto";
import type { Reservation } from "@prisma/client";
import { getSetting } from "./settings";

// Przelewy24 REST API v1 (https://developers.przelewy24.pl).
// Konfiguracja z panelu superadmina (PlatformSetting) z fallbackiem na env.
// Brak kompletu danych P24 => tryb symulacji (przycisk potwierdza od razu).

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

async function config(): Promise<P24Config | null> {
  const [merchantId, posId, apiKey, crc, sandboxRaw] = await Promise.all([
    getSetting("P24_MERCHANT_ID"),
    getSetting("P24_POS_ID"),
    getSetting("P24_API_KEY"),
    getSetting("P24_CRC"),
    getSetting("P24_SANDBOX"),
  ]);
  if (!merchantId || !posId || !apiKey || !crc) return null;
  const sandbox = sandboxRaw !== "false";
  return {
    merchantId: Number(merchantId),
    posId: Number(posId),
    apiKey,
    crc,
    baseUrl: sandbox
      ? "https://sandbox.przelewy24.pl"
      : "https://secure.przelewy24.pl",
  };
}

export async function p24Configured(): Promise<boolean> {
  return (await config()) !== null;
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
  const cfg = await config();
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
export async function verifyP24NotificationSign(
  n: P24Notification
): Promise<boolean> {
  const cfg = await config();
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
  const cfg = await config();
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
