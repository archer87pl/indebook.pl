// Ochrona przed SSRF przy pobieraniu zasobów spod URL-i podanych przez
// użytkownika (feedy iCal). Blokujemy adresy prywatne, loopback, link-local
// i metadata cloud (169.254.169.254).

import { lookup } from "node:dns/promises";

/** Czy adres IP (v4 lub v6) należy do zakresu prywatnego/wewnętrznego. */
export function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (v === "::1" || v === "::") return true;

  // IPv4 oraz IPv4-mapowane w IPv6 (::ffff:a.b.c.d)
  const mapped = v.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  const target = mapped ? mapped[1] : v;
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(target)) {
    const p = target.split(".").map(Number);
    if (p.some((n) => n > 255)) return true; // zniekształcony → traktuj jako niebezpieczny
    const [a, b] = p;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local + metadata (169.254.169.254)
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  // IPv6: ULA fc00::/7 (fc.. / fd..) i link-local fe80::/10
  if (/^f[cd]/.test(v)) return true;
  if (/^fe[89ab]/.test(v)) return true;
  return false;
}

/**
 * Waliduje URL i upewnia się, że host nie rozwiązuje się na adres wewnętrzny.
 * Rzuca Error z komunikatem po polsku przy problemie. Zwraca sparsowany URL.
 * Uwaga: przy właściwym fetchu należy użyć `redirect: "error"`, bo ten check
 * dotyczy tylko hosta docelowego (redirect mógłby wskazać wnętrze sieci).
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Nieprawidłowy adres URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Dozwolone są tylko adresy http/https.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isPrivateIp(host)) throw new Error("Adres wskazuje na zasób wewnętrzny.");

  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new Error("Nie udało się rozwiązać adresu hosta.");
  }
  if (addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error("Adres wskazuje na zasób wewnętrzny.");
  }
  return url;
}
