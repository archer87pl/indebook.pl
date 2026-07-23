// Klasyfikacja hosta żądania: aplikacja Rezio vs strona WWW obiektu.
// Czysta logika (bez DB) — używana w proxy.ts przy każdym żądaniu.

export type HostKind = { kind: "app" } | { kind: "site"; key: string };

export function sitesBaseDomain(): string {
  return (process.env.SITES_BASE_DOMAIN || "rezop.pl").toLowerCase();
}

function appHostFromEnv(): string {
  try {
    return new URL(process.env.APP_URL || "http://localhost:3000").hostname.toLowerCase();
  } catch {
    return "localhost";
  }
}

export function classifyHost(
  hostHeader: string | null,
  opts?: { base?: string; appHost?: string }
): HostKind {
  const base = (opts?.base ?? sitesBaseDomain()).toLowerCase();
  const appHost = (opts?.appHost ?? appHostFromEnv()).toLowerCase();
  const host = (hostHeader ?? "").toLowerCase().replace(/:\d+$/, "");

  if (!host || host === "localhost" || host === "127.0.0.1") return { kind: "app" };
  if (host === appHost || host === base || host === `www.${base}`) return { kind: "app" };

  // dev: nazwa.localhost → strona obiektu
  if (host.endsWith(".localhost")) {
    const sub = host.slice(0, -".localhost".length);
    return sub.includes(".") ? { kind: "app" } : { kind: "site", key: sub };
  }

  // subdomena bazy: nazwa.rezop.pl (bez zagnieżdżeń)
  if (host.endsWith(`.${base}`)) {
    const sub = host.slice(0, -(base.length + 1));
    return sub.includes(".") ? { kind: "app" } : { kind: "site", key: sub };
  }

  // wszystko inne traktujemy jak własną domenę klienta
  const key = host.startsWith("www.") ? host.slice(4) : host;
  return { kind: "site", key };
}

// Kanoniczny publiczny adres strony (do linków w panelu, canonical, sitemap).
export function siteUrl(
  site: { subdomain: string; customDomain: string | null; domainStatus: string },
  opts?: { base?: string; appHost?: string }
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
