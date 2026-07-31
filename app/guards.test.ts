import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Wartownicy autoryzacji na granicy aplikacji.
//
// Testy jednostkowe sprawdzają MODUŁY, a te sprawdzają, czy moduły są w ogóle
// wywołane tam, gdzie trzeba. To jedyny rodzaj testu, który wyłapie klasę
// błędu „ktoś dodał nowy ekran panelu i zapomniał o `requireOwner`" —
// nowy plik przechodzi typy, lint i cały pakiet testów, a wystawia cudze dane
// każdemu zalogowanemu.
//
// Test jest celowo składniowy (szuka wywołania w źródle), a nie behawioralny:
// uruchomienie strony Next poza serwerem wymagałoby atrapy połowy frameworka,
// a pytanie brzmi „czy wartownik jest wpięty", nie „czy działa" — to drugie
// pokrywa lib/auth.test.ts.

const ROOT = join(import.meta.dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const rel = (path: string) => relative(ROOT, path).replace(/\\/g, "/");
const read = (path: string) => readFileSync(path, "utf8");

const files = walk(join(ROOT, "app")).filter((f) => !f.endsWith(".test.ts"));
const pages = files.filter((f) => /[\\/]page\.tsx$/.test(f));
const layouts = files.filter((f) => /[\\/]layout\.tsx$/.test(f));
const routes = files.filter((f) => /[\\/]route\.ts$/.test(f));

const under = (list: string[], segment: string) =>
  list.filter((f) => rel(f).includes(segment));

describe("panel recepcji", () => {
  const adminPages = under(pages, "app/admin/");

  it("w ogóle są jakieś ekrany panelu (test nie sprawdza pustego zbioru)", () => {
    // bez tego cały opis niżej przechodziłby po zmianie struktury katalogów
    expect(adminPages.length).toBeGreaterThan(5);
  });

  it("każdy ekran panelu sam sprawdza właściciela", () => {
    // sam wartownik w layoucie nie wystarcza: strona i tak potrzebuje `property`
    // do zawężenia zapytań, a poleganie na rodzicu zostawia furtkę przy
    // przenoszeniu plików
    const bez = adminPages.filter((f) => !read(f).includes("requireOwner"));

    expect(bez.map(rel)).toEqual([]);
  });

  it("layout panelu też ma wartownika", () => {
    const layout = layouts.find((f) => rel(f) === "app/admin/layout.tsx")!;

    expect(read(layout)).toContain("requireOwner");
  });
});

describe("panel platformy", () => {
  const superPages = under(pages, "superadmin");

  it("w ogóle są jakieś ekrany platformy", () => {
    expect(superPages.length).toBeGreaterThan(3);
  });

  it("każdy ekran platformy sprawdza superadmina", () => {
    // te ekrany widzą WSZYSTKIE obiekty — pomyłka tutaj to wyciek całej bazy
    const bez = superPages.filter((f) => !read(f).includes("requireSuperadmin"));

    expect(bez.map(rel)).toEqual([]);
  });

  it("ekran platformy nie zadowala się wartownikiem właściciela", () => {
    // `requireOwner` przepuszcza każdego zalogowanego właściciela
    const zlyWartownik = superPages.filter(
      (f) => !read(f).includes("requireSuperadmin") && read(f).includes("requireOwner"),
    );

    expect(zlyWartownik.map(rel)).toEqual([]);
  });
});

describe("trasy API", () => {
  /**
   * Sposoby, w jakie trasa może się bronić. Każdy odpowiada innemu rodzajowi
   * wywołującego: sesja (panel), sekret w nagłówku (cron, webhook), podpis
   * dostawcy (P24), podpisany stan (OAuth), token w adresie (iCal).
   */
  const GUARDS = [
    "requireOwner",
    "requireSuperadmin",
    "getSessionUser",
    "safeEqual",
    "verifyState",
    "verifyP24NotificationSign",
    // trasa serwująca pliki broni się inaczej: nie pyta KTO, tylko dokąd
    // sięga ścieżka — `photoPathOnDisk` rzuca przy wyjściu poza katalog uploadów
    "photoPathOnDisk",
  ];

  /**
   * Trasy celowo publiczne — z powodem. Wpis tutaj to świadoma decyzja,
   * a nie przeoczenie.
   */
  const PUBLICZNE: Record<string, string> = {
    "app/api/sites/availability/route.ts":
      "widget kalendarza na stronie WWW; te same dane pokazuje publiczna wyszukiwarka, a trasa i tak odsiewa obiekty zawieszone i strony nieopublikowane",
    "app/api/sites/inquiry/route.ts":
      "formularz kontaktowy gościa — zamiast sesji ma limit zapytań i pułapkę na boty",
    "app/api/sites/locale/route.ts":
      "zapis wybranego języka w cookie; nie czyta ani nie zmienia żadnych danych",
    "app/sites/[host]/robots.txt/route.ts":
      "robots.txt strony obiektu — z definicji czytany przez roboty wyszukiwarek bez żadnej sesji",
    "app/sites/[host]/sitemap.xml/route.ts":
      "mapa strony obiektu — wypisuje wyłącznie adresy, które i tak są publiczne",
  };

  it("każda trasa albo się broni, albo jest jawnie wpisana jako publiczna", () => {
    const bezObrony = routes
      .map(rel)
      .filter((path) => !(path in PUBLICZNE))
      .filter((path) => !GUARDS.some((g) => read(join(ROOT, path)).includes(g)));

    expect(bezObrony).toEqual([]);
  });

  it("lista publicznych tras nie zawiera wpisów po nieistniejących plikach", () => {
    // lista wyjątków, która nie jest sprzątana, po roku usprawiedliwia
    // wszystko i nic nie pilnuje
    const istniejace = new Set(routes.map(rel));
    const martwe = Object.keys(PUBLICZNE).filter((p) => !istniejace.has(p));

    expect(martwe).toEqual([]);
  });

  it("każdy wyjątek ma napisany powód", () => {
    for (const [path, powod] of Object.entries(PUBLICZNE)) {
      expect(powod.length, path).toBeGreaterThan(30);
    }
  });

  it("trasy crona sprawdzają sekret i są fail-closed", () => {
    // brak CRON_SECRET musi zamykać endpoint, a nie otwierać go dla wszystkich
    const cron = routes.filter((f) => rel(f).includes("app/api/cron/"));
    expect(cron.length).toBeGreaterThan(0);

    for (const f of cron) {
      const src = read(f);
      expect(src, rel(f)).toMatch(/safeEqual\s*\(/);
      expect(src, rel(f)).toMatch(/if \(!secret/);
    }
  });

  it("każda trasa czytająca sekret porównuje go przez safeEqual", () => {
    // Zwykłe `===` na ciągach kończy się na pierwszej różnicy i zdradza sekret
    // czasem odpowiedzi. Regułę wiążemy z ŹRÓDŁEM sekretu, a nie ze wzorcem
    // porównania: pierwsza wersja szukała „secret ===" i przepuszczała
    // porównanie całego nagłówka `Bearer …` (wychwycone mutacją).
    const CZYTA_SEKRET = /process\.env\.\w*(SECRET|TOKEN|KEY)|searchParams\.get\("t"\)/;

    const bezStalegoCzasu = routes
      .map((f) => ({ path: rel(f), src: read(f) }))
      // szukamy WYWOŁANIA, nie wzmianki: sam import zostaje w pliku po
      // podmianie porównania i przepuszczałby mutację
      .filter(({ src }) => CZYTA_SEKRET.test(src) && !/safeEqual\s*\(/.test(src))
      .map(({ path }) => path);

    expect(bezStalegoCzasu).toEqual([]);
  });

  it("reguła powyżej ma na czym działać — sekrety w ogóle są czytane", () => {
    // gdyby wzorzec przestał pasować (zmiana nazw zmiennych środowiskowych),
    // poprzedni test przechodziłby na pustym zbiorze
    const czytajace = routes.filter((f) =>
      /process\.env\.\w*(SECRET|TOKEN|KEY)|searchParams\.get\("t"\)/.test(read(f)),
    );

    expect(czytajace.length).toBeGreaterThanOrEqual(4);
  });
});
