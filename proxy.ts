// Routing hostów (Next.js 16: dawne middleware). Żądania do subdomen
// *.SITES_BASE_DOMAIN i własnych domen klientów przepisujemy na wewnętrzną
// ścieżkę /sites/<klucz>, którą renderuje app/sites/[host]. Host aplikacji
// (APP_URL / localhost) przechodzi bez zmian. Uwaga: katalog nie może mieć
// prefiksu "_" — App Router wyklucza takie foldery z routingu.

import { NextResponse, type NextRequest } from "next/server";
import { classifyHost } from "@/lib/site-host";

export function proxy(request: NextRequest) {
  const kind = classifyHost(request.headers.get("host"));
  if (kind.kind === "app") return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/sites/${kind.key}${url.pathname === "/" ? "" : url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // /api/* celowo poza rewritem — widget kalendarza i formularz kontaktowy
  // ze stron obiektów biją w API aplikacji z tej samej domeny.
  matcher: ["/((?!_next/|api/|favicon.ico|icon|uploads/).*)"],
};
