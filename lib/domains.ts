// Podpinanie własnych domen do stron WWW obiektów — za abstrakcją
// DomainProvider, żeby dało się zmigrować z Vercela (np. na Cloudflare
// for SaaS lub własne proxy) bez ruszania panelu i akcji.
//
// Implementacja MVP: Vercel API (domena dodawana do projektu aplikacji,
// SSL wystawia Vercel automatycznie po weryfikacji DNS).
// Env: VERCEL_TOKEN, VERCEL_PROJECT_ID, opcjonalnie VERCEL_TEAM_ID.
// Brak env = funkcja domen ukryta w panelu (wzorzec jak tryb symulacji P24).

import { sitesBaseDomain } from "./site-host";

export type DomainDnsRecord = { type: "A" | "CNAME" | "TXT"; name: string; value: string };

export type DomainCheck = {
  status: "PENDING" | "VERIFIED" | "ERROR";
  message: string;
  records: DomainDnsRecord[];
};

export interface DomainProvider {
  /** Rejestruje domenę (apex + www z przekierowaniem). */
  add(domain: string): Promise<void>;
  /** Aktualny stan weryfikacji/konfiguracji DNS. */
  check(domain: string): Promise<DomainCheck>;
  /** Usuwa domenę (oba warianty). */
  remove(domain: string): Promise<void>;
}

// Rekordy DNS Vercela (stałe od lat; TXT weryfikacyjny dochodzi z API).
export const VERCEL_A_VALUE = "76.76.21.21";
export const VERCEL_CNAME_VALUE = "cname.vercel-dns.com";

export function defaultRecords(): DomainDnsRecord[] {
  return [
    { type: "A", name: "@", value: VERCEL_A_VALUE },
    { type: "CNAME", name: "www", value: VERCEL_CNAME_VALUE },
  ];
}

/** Walidacja i normalizacja domeny wpisanej przez użytkownika. */
export function normalizeDomain(input: string): string | null {
  let d = input.trim().toLowerCase();
  if (!d) return null;
  d = d.replace(/^https?:\/\//, "").split(/[/?#]/)[0];
  d = d.replace(/^www\./, "").replace(/\.$/, "");
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) return null;
  // nie pozwalamy podpiąć bazowej domeny platformy ani jej subdomen
  const base = sitesBaseDomain();
  if (d === base || d.endsWith(`.${base}`)) return null;
  return d;
}

type Json = Record<string, unknown> | null;

/** Czysta funkcja mapująca odpowiedzi Vercel API na status domeny (testowalna). */
export function mapVercelStatus(projectDomain: unknown, domainConfig: unknown): DomainCheck {
  const pd = (projectDomain ?? {}) as Record<string, unknown>;
  const cfg = (domainConfig ?? {}) as Record<string, unknown>;

  if (pd.error) {
    const err = pd.error as Record<string, unknown>;
    return {
      status: "ERROR",
      message: String(err.message ?? "Błąd sprawdzania domeny. Spróbuj ponownie."),
      records: [],
    };
  }

  const records = defaultRecords();

  if (pd.verified !== true) {
    const verification = Array.isArray(pd.verification) ? pd.verification : [];
    for (const v of verification) {
      const rec = v as Record<string, unknown>;
      if (rec.type === "TXT") {
        records.push({ type: "TXT", name: String(rec.domain ?? ""), value: String(rec.value ?? "") });
      }
    }
    return {
      status: "PENDING",
      message:
        "Domena czeka na weryfikację. Dodaj poniższe rekordy DNS u swojego rejestratora i odśwież status.",
      records,
    };
  }

  if (cfg.misconfigured === true) {
    return {
      status: "PENDING",
      message:
        "Domena zweryfikowana, ale DNS jeszcze nie wskazuje na serwer. Sprawdź rekordy i poczekaj na propagację (do 24 h).",
      records,
    };
  }

  return {
    status: "VERIFIED",
    message: "Domena działa. Certyfikat SSL wystawia się automatycznie.",
    records,
  };
}

class VercelDomainProvider implements DomainProvider {
  constructor(
    private token: string,
    private projectId: string,
    private teamId?: string
  ) {}

  private url(path: string): string {
    return `https://api.vercel.com${path}${this.teamId ? `?teamId=${this.teamId}` : ""}`;
  }

  private async request(method: string, path: string, body?: unknown): Promise<Json> {
    const res = await fetch(this.url(path), {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return (await res.json().catch(() => null)) as Json;
  }

  async add(domain: string): Promise<void> {
    await this.request("POST", `/v10/projects/${this.projectId}/domains`, { name: domain });
    // wariant www przekierowuje na apex
    await this.request("POST", `/v10/projects/${this.projectId}/domains`, {
      name: `www.${domain}`,
      redirect: domain,
    });
  }

  async check(domain: string): Promise<DomainCheck> {
    const [projectDomain, config] = await Promise.all([
      this.request("GET", `/v9/projects/${this.projectId}/domains/${domain}`),
      this.request("GET", `/v6/domains/${domain}/config`),
    ]);
    return mapVercelStatus(projectDomain, config);
  }

  async remove(domain: string): Promise<void> {
    await this.request("DELETE", `/v9/projects/${this.projectId}/domains/www.${domain}`);
    await this.request("DELETE", `/v9/projects/${this.projectId}/domains/${domain}`);
  }
}

/** null = brak konfiguracji (sekcja domen ukryta w panelu). */
export function domainProvider(): DomainProvider | null {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return null;
  return new VercelDomainProvider(token, projectId, process.env.VERCEL_TEAM_ID);
}
