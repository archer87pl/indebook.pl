// Podpisany `state` do OAuth (Airbnb): zawiera propertyId + timestamp, chroniony
// HMAC sekretem, żeby callback nie dał się sfałszować.
import { createHmac } from "node:crypto";
import { safeEqual } from "../password";

function secret(): string {
  return process.env.CHANNEX_WEBHOOK_SECRET || "channex-oauth-fallback";
}

export function signState(propertyId: number): string {
  const payload = `${propertyId}.${Date.now()}`;
  const sig = createHmac("sha256", secret()).update(payload).digest("hex").slice(0, 32);
  return `${payload}.${sig}`;
}

/** Zwraca propertyId gdy podpis poprawny i token świeży (<1 h), inaczej null. */
export function verifyState(state: string, maxAgeMs = 3600_000): number | null {
  const parts = (state || "").split(".");
  if (parts.length !== 3) return null;
  const [pid, ts, sig] = parts;
  const expected = createHmac("sha256", secret()).update(`${pid}.${ts}`).digest("hex").slice(0, 32);
  if (!safeEqual(sig, expected)) return null;
  const age = Date.now() - Number(ts);
  if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) return null;
  const propertyId = Number(pid);
  return Number.isInteger(propertyId) ? propertyId : null;
}
