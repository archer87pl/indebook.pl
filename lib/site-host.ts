// Klasyfikacja hosta żądania: aplikacja Rezio vs strona WWW obiektu.
// Czysta logika (bez DB) — używana w proxy.ts przy każdym żądaniu.
//
// Zasada bezpieczeństwa: subdomeny bazy przepisujemy zawsze, ale obce domeny
// tylko wstępnie klasyfikujemy jako "custom" — proxy przepisuje je dopiero,
// gdy domena istnieje w bazie (Site.customDomain). Dzięki temu błędna
// konfiguracja APP_URL nie wyłącza całej aplikacji na produkcji.

export type HostKind =
  | { kind: "app" }
  | { kind: "subdomain"; key: string }
  | { kind: "custom"; key: string };

export function sitesBaseDomain(): string {
  return (process.env.SITES_BASE_DOMAIN || "rezop.pl").toLowerCase();
}

function hostnameOf(value: string): string | null {
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Hosty, pod którymi działa sama aplikacja (panel, landing, rezerwacje). */
export function appHosts(): string[] {
  const hosts = new Set<string>(["localhost", "127.0.0.1"]);
  const fromUrl = hostnameOf(process.env.APP_URL || "http://localhost:3000");
  if (fromUrl) hosts.add(fromUrl);
  // Vercel wstrzykuje hosty deploymentu — traktujemy je jak aplikację
  for (const env of [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
    const h = env && hostnameOf(env);
    if (h) hosts.add(h);
  }
  // dodatkowe hosty aplikacji (np. stara domena), rozdzielone przecinkami
  for (const part of (process.env.APP_HOSTS || "").split(",")) {
    const h = part.trim() && hostnameOf(part.trim());
    if (h) hosts.add(h);
  }
  return [...hosts];
}

export function classifyHost(
  hostHeader: string | null,
  opts?: { base?: string; appHosts?: string[] }
): HostKind {
  const base = (opts?.base ?? sitesBaseDomain()).toLowerCase();
  const app = new Set((opts?.appHosts ?? appHosts()).map((h) => h.toLowerCase()));
  const host = (hostHeader ?? "").toLowerCase().replace(/:\d+$/, "");
  const bare = host.startsWith("www.") ? host.slice(4) : host;

  if (!host || app.has(host) || app.has(bare)) return { kind: "app" };
  if (host === base || bare === base) return { kind: "app" };
  // podglądy i aliasy deploymentów Vercela to zawsze aplikacja
  if (host.endsWith(".vercel.app")) return { kind: "app" };

  // dev: nazwa.localhost → strona obiektu
  if (host.endsWith(".localhost")) {
    const sub = host.slice(0, -".localhost".length);
    return sub.includes(".") ? { kind: "app" } : { kind: "subdomain", key: sub };
  }

  // subdomena bazy: nazwa.rezop.pl (bez zagnieżdżeń)
  if (host.endsWith(`.${base}`)) {
    const sub = host.slice(0, -(base.length + 1));
    return sub.includes(".") ? { kind: "app" } : { kind: "subdomain", key: sub };
  }

  // wszystko inne to potencjalna domena własna klienta — proxy zweryfikuje w DB
  return { kind: "custom", key: bare };
}

// Kanoniczny publiczny adres strony (do linków w panelu, canonical, sitemap).
export function siteUrl(
  site: { subdomain: string; customDomain: string | null; domainStatus: string },
  opts?: { base?: string }
): string {
  const base = (opts?.base ?? sitesBaseDomain()).toLowerCase();
  if (site.customDomain && site.domainStatus === "VERIFIED") {
    return `https://${site.customDomain}`;
  }
  // dev: APP_URL na localhoście → strony na nazwa.localhost:port
  if (!opts) {
    try {
      const app = new URL(process.env.APP_URL || "http://localhost:3000");
      if (app.hostname === "localhost") {
        return `http://${site.subdomain}.localhost${app.port ? `:${app.port}` : ""}`;
      }
    } catch {
      // niepoprawny APP_URL — spadamy na adres produkcyjny
    }
  }
  return `https://${site.subdomain}.${base}`;
}
