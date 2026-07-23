import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// Hash nieistniejącego (nierozwiązywalnego) hasła — do wykonania „na pusto"
// przy logowaniu, gdy konto nie istnieje, żeby czas odpowiedzi nie zdradzał
// istnienia e-maila (ochrona przed enumeracją użytkowników).
export const DUMMY_PASSWORD_HASH = hashPassword("rezio-dummy-password");

// Stałoczasowe porównanie dwóch stringów (podpisy, tokeny). Najpierw długość
// przez timingSafeEqual na buforach równej długości, potem właściwe porównanie.
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
