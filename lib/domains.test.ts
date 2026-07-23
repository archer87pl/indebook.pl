import { describe, expect, it } from "vitest";
import { mapVercelStatus, normalizeDomain } from "./domains";

describe("normalizeDomain", () => {
  it("czyści schemat, www, ścieżkę i wielkość liter", () => {
    expect(normalizeDomain("https://www.MojObiekt.pl/cennik?x=1")).toBe("mojobiekt.pl");
    expect(normalizeDomain("mojobiekt.pl")).toBe("mojobiekt.pl");
    expect(normalizeDomain("  apartamenty-w-gorach.com.pl  ")).toBe("apartamenty-w-gorach.com.pl");
  });

  it("odrzuca śmieci", () => {
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain("bez-kropki")).toBeNull();
    expect(normalizeDomain("z spacją.pl")).toBeNull();
    expect(normalizeDomain("mojobiekt.rezop.pl")).toBeNull(); // subdomeny bazy nie wolno
    expect(normalizeDomain("localhost")).toBeNull();
  });
});

describe("mapVercelStatus", () => {
  it("verified + poprawna konfiguracja → VERIFIED", () => {
    const out = mapVercelStatus({ verified: true }, { misconfigured: false });
    expect(out.status).toBe("VERIFIED");
  });

  it("brak weryfikacji → PENDING z rekordami TXT do wpisania", () => {
    const out = mapVercelStatus(
      {
        verified: false,
        verification: [{ type: "TXT", domain: "_vercel.mojobiekt.pl", value: "vc-domain-verify=abc" }],
      },
      { misconfigured: true }
    );
    expect(out.status).toBe("PENDING");
    expect(out.records.some((r) => r.type === "TXT" && r.value.includes("vc-domain-verify"))).toBe(true);
  });

  it("zweryfikowana, ale źle wpięte DNS → PENDING (czeka na propagację)", () => {
    const out = mapVercelStatus({ verified: true }, { misconfigured: true });
    expect(out.status).toBe("PENDING");
    expect(out.records.some((r) => r.type === "A")).toBe(true);
  });

  it("błąd API → ERROR z komunikatem", () => {
    const out = mapVercelStatus({ error: { code: "not_found", message: "Domain not found" } }, null);
    expect(out.status).toBe("ERROR");
    expect(out.message.length).toBeGreaterThan(0);
  });
});
