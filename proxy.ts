// Routing hostów (Next.js 16: dawne middleware). Subdomeny *.SITES_BASE_DOMAIN
// przepisujemy na /sites/<klucz> bezwarunkowo; obce domeny — tylko gdy są
// faktycznie podpięte w bazie (Site.customDomain). Nierozpoznany host
// przechodzi do aplikacji, więc błędna konfiguracja APP_URL nigdy nie
// wyłącza całej aplikacji (produkcja pokazuje landing, nie 404).
// Uwaga: katalog docelowy nie może mieć prefiksu "_" — App Router wyklucza
// takie foldery z routingu.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { classifyHost } from "@/lib/site-host";

// Cache wyników lookupu domen własnych (per instancja, 60 s) — proxy działa
// na każdym żądaniu, a wynik zmienia się tylko przy (od)pinaniu domeny.
const DOMAIN_CACHE_MS = 60_000;
const domainCache = new Map<string, { isTenant: boolean; until: number }>();

async function isTenantDomain(domain: string): Promise<boolean> {
  const cached = domainCache.get(domain);
  if (cached && cached.until > Date.now()) return cached.isTenant;
  let isTenant = false;
  try {
    isTenant = !!(await prisma.site.findFirst({
      where: { customDomain: domain },
      select: { id: true },
    }));
  } catch {
    // problem z DB — bezpieczniej puścić żądanie do aplikacji niż pokazać 404
  }
  domainCache.set(domain, { isTenant, until: Date.now() + DOMAIN_CACHE_MS });
  return isTenant;
}

export async function proxy(request: NextRequest) {
  const kind = classifyHost(request.headers.get("host"));
  if (kind.kind === "app") return NextResponse.next();
  if (kind.kind === "custom" && !(await isTenantDomain(kind.key))) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = `/sites/${kind.key}${url.pathname === "/" ? "" : url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // /api/* celowo poza rewritem — widget kalendarza i formularz kontaktowy
  // ze stron obiektów biją w API aplikacji z tej samej domeny.
  matcher: ["/((?!_next/|api/|favicon.ico|icon|uploads/).*)"],
};
