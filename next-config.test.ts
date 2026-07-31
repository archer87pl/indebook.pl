import { describe, expect, it } from "vitest";
import config from "./next.config";

// Nagłówki bezpieczeństwa. Widget kalendarza wymaga, żeby /embed dało się
// osadzić w ramce na CUDZEJ domenie — a to znaczy nie wysyłać tam
// `X-Frame-Options` (ten nagłówek nie ma wartości „zezwól wszystkim";
// `ALLOW-FROM` jest martwe od lat).
//
// Cała wartość tych testów polega na pilnowaniu GRANICY tego zwolnienia.
// Gdyby ktoś „uprościł" wzorzec z powrotem do `/:path*`, panel recepcji dałby
// się osadzić w cudzej ramce i podstawić właścicielowi kliknięcia — a nic
// w aplikacji by tego nie zauważyło.

type Naglowek = { key: string; value: string };
type Regula = { source: string; headers: Naglowek[] };

const reguly = async (): Promise<Regula[]> =>
  (await config.headers!()) as Regula[];

/** Reguły pasujące do ścieżki — wzorce Next tłumaczymy na wyrażenia regularne. */
const dlaSciezki = (rs: Regula[], path: string) =>
  rs.filter((r) => {
    const wzor = r.source.replace("/:path*", "(/.*)?").replace(":path*", ".*");
    return new RegExp(`^${wzor}$`).test(path);
  });

const naglowki = (rs: Regula[], path: string) =>
  Object.fromEntries(dlaSciezki(rs, path).flatMap((r) => r.headers).map((h) => [h.key, h.value]));

describe("granica zwolnienia z X-Frame-Options", () => {
  it("panel recepcji zostaje z SAMEORIGIN", async () => {
    const h = naglowki(await reguly(), "/admin/rezerwacje");

    expect(h["X-Frame-Options"]).toBe("SAMEORIGIN");
  });

  it("strona główna i trasy gościa też", async () => {
    const rs = await reguly();

    expect(naglowki(rs, "/")["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(naglowki(rs, "/r/HO-ABC12345")["X-Frame-Options"]).toBe("SAMEORIGIN");
  });

  it("widget NIE dostaje X-Frame-Options — inaczej ramka nie zadziała", async () => {
    const h = naglowki(await reguly(), "/embed/kalendarz/7");

    expect(h["X-Frame-Options"]).toBeUndefined();
  });

  it("widget pozwala na ramkę wprost, przez frame-ancestors", async () => {
    const h = naglowki(await reguly(), "/embed/kalendarz/7");

    expect(h["Content-Security-Policy"]).toContain("frame-ancestors");
  });

  it("zwolnienie nie obejmuje ścieżki tylko ZACZYNAJĄCEJ SIĘ podobnie", async () => {
    // „/embedded-cokolwiek" ma zostać po stronie SAMEORIGIN
    const h = naglowki(await reguly(), "/embedding-panel");

    expect(h["X-Frame-Options"]).toBe("SAMEORIGIN");
  });

  it("dokładnie jedna reguła obsługuje daną ścieżkę", async () => {
    // nakładające się wzorce dawałyby dwa komplety nagłówków i wynik
    // zależny od kolejności — łatwo przeoczyć przy edycji
    const rs = await reguly();

    expect(dlaSciezki(rs, "/admin")).toHaveLength(1);
    expect(dlaSciezki(rs, "/embed/kalendarz/7")).toHaveLength(1);
  });
});

describe("nagłówki wspólne", () => {
  it("widget też dostaje komplet pozostałych zabezpieczeń", async () => {
    // zwolnienie dotyczy JEDNEGO nagłówka, nie całego zestawu
    const h = naglowki(await reguly(), "/embed/kalendarz/7");

    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Strict-Transport-Security"]).toContain("max-age=");
  });

  it("reszta aplikacji ma te same wspólne nagłówki", async () => {
    const h = naglowki(await reguly(), "/admin");

    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });
});
