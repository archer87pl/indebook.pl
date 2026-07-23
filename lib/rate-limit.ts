// Prosty rate-limiter oknem stałym, trzymany w bazie — działa między
// instancjami serverless (in-memory na Vercelu byłby per-instancja i nieszczelny).
// Nie jest w 100% atomowy pod ekstremalną współbieżnością, ale w zupełności
// wystarcza do hamowania brute-force / spamu.

import { headers } from "next/headers";
import { prisma } from "./db";

/** IP klienta z nagłówków proxy (Vercel/reverse proxy). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return h.get("x-real-ip") || "unknown";
}

/**
 * Zwraca true, gdy żądanie mieści się w limicie (i zlicza je), false gdy
 * limit przekroczony. `key` powinien zawierać rodzaj akcji i identyfikator
 * (np. "login:1.2.3.4").
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  // W dev/test nie hamujemy (m.in. żeby licznik nie psuł e2e). Na Vercelu
  // — również w preview/staging — NODE_ENV=production, więc ochrona działa.
  if (process.env.NODE_ENV !== "production") return true;
  const now = new Date();
  try {
    const existing = await prisma.rateLimit.findUnique({ where: { key } });
    if (!existing || existing.resetAt <= now) {
      const resetAt = new Date(now.getTime() + windowMs);
      await prisma.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, resetAt },
        update: { count: 1, resetAt },
      });
      return true;
    }
    if (existing.count >= limit) return false;
    await prisma.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
    return true;
  } catch {
    // awaria licznika nie może blokować logowania — przepuszczamy (fail-open
    // tylko dla samego rate-limitu; właściwa autoryzacja i tak działa dalej)
    return true;
  }
}

/** Rate-limit po IP; przy przekroczeniu wykonuje redirect na podany URL błędu. */
export async function rateLimitOrRedirect(
  action: string,
  limit: number,
  windowMs: number,
  redirectTo: string
): Promise<void> {
  const ip = await clientIp();
  const ok = await rateLimit(`${action}:${ip}`, limit, windowMs);
  if (!ok) {
    const { redirect } = await import("next/navigation");
    redirect(redirectTo);
  }
}
