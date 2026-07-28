// Ustawienie języka strony WWW obiektu (cookie SITE_LOCALE). Strony obiektów
// są poza routingiem next-intl, więc przełącznik zapisuje wybór tutaj.

import { NextResponse } from "next/server";
import { SITE_LOCALE_COOKIE } from "@/lib/site-locale";
import { isAppLocale } from "@/i18n/routing";

export async function POST(request: Request) {
  let locale = "";
  try {
    const body = (await request.json()) as { locale?: unknown };
    locale = typeof body.locale === "string" ? body.locale : "";
  } catch {
    return NextResponse.json({ error: "Złe żądanie" }, { status: 400 });
  }
  if (!isAppLocale(locale)) {
    return NextResponse.json({ error: "Nieznany język" }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SITE_LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 365 * 24 * 3600,
    sameSite: "lax",
  });
  return res;
}
