import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SiteConfig } from "./site-config";

// Akcje kreatora stron WWW. Cały moduł operuje na dwóch kopiach konfiguracji:
// szkicu (draftConfig), który właściciel edytuje, i wersji opublikowanej
// (publishedConfig), którą widzą goście. Żadna edycja nie może dotknąć wersji
// publicznej bez jawnej publikacji — to jest istota tego modułu. Poza tym:
// gating planów (kreator od Standard, własna domena od Pro), unikalność
// subdomeny i limity długości pól, bo treść idzie na publiczną stronę.

class RedirectError extends Error {
  constructor(readonly to: string) {
    super(`REDIRECT ${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
}));

const revalidated: string[] = [];
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    revalidated.push(path);
  },
}));

let owner = { user: { id: 5 }, property: { id: 3, name: "Willa Pod Dębem", slug: "willa", plan: "STANDARD" } };
vi.mock("./auth", () => ({ requireOwner: async () => owner }));

type Site = {
  id: number;
  propertyId: number;
  subdomain: string;
  template: string;
  customDomain: string | null;
  domainStatus: string;
  draftConfig: unknown;
  publishedConfig: unknown;
};

let site: Site | null = null;
/** Zajęte subdomeny → właściciel. Atrapa MUSI odpowiadać per adres: stała
 *  odpowiedź „zajęte" zawiesza pętlę szukającą wolnego numeru. */
let takenSubdomains = new Map<string, { id: number }>();
let domainOwner: { id: number; domainStatus: string } | null = null;
let fullProperty: Record<string, unknown> = {};

const siteUpdates: { id: number; data: Record<string, unknown> }[] = [];
const sitesCreated: Record<string, unknown>[] = [];
let saveError: Error | null = null;
const filesSaved: string[] = [];

vi.mock("./db", () => ({
  prisma: {
    site: {
      findUnique: async ({ where }: { where: { subdomain?: string; propertyId?: number } }) =>
        where.subdomain !== undefined ? (takenSubdomains.get(where.subdomain) ?? null) : site,
      findFirst: async () => domainOwner,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        sitesCreated.push(data);
        return { id: 21, ...data };
      },
      update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
        siteUpdates.push({ id: where.id, data });
        return { ...site, ...data };
      },
    },
    property: { findUniqueOrThrow: async () => fullProperty },
  },
}));

vi.mock("./photos", () => ({
  savePhotoFile: async (_file: File, prefix: string) => {
    if (saveError) throw saveError;
    filesSaved.push(prefix);
    return `/uploads/${prefix}-logo.png`;
  },
}));

const domainCalls: { op: string; domain: string }[] = [];
let domainCheckStatus = "PENDING";
let provider: Record<string, unknown> | null = null;
vi.mock("./domains", async (importOriginal) => {
  const original = await importOriginal<typeof import("./domains")>();
  return { ...original, domainProvider: () => provider };
});

const { addSiteSection, convertSectionToHtml, createSite, moveSiteSection, publishSite, refreshDomainStatus, removeCustomDomain, removeSiteSection, revertSiteDraft, setCustomDomain, toggleSiteSection, updateSiteCss, updateSiteSeo, updateSiteSection, updateSiteSubdomain, updateSiteTheme } =
  await import("./site-actions");
const { normalizeConfig, buildDefaultConfig } = await import("./site-config");

const form = (entries: Record<string, string | File>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};

async function target(run: Promise<void>): Promise<string> {
  try {
    await run;
    throw new Error("akcja nie przekierowała");
  } catch (e) {
    if (e instanceof RedirectError) return decodeURIComponent(e.to);
    throw e;
  }
}

/** Szkic zapisany przez ostatnią akcję. */
const savedDraft = (): SiteConfig =>
  normalizeConfig(siteUpdates.at(-1)!.data.draftConfig);

const BASE_PROPERTY = {
  id: 3,
  name: "Willa Pod Dębem",
  slug: "willa",
  description: "Opis obiektu",
  address: "Zakopane",
  photos: [{ id: 91, path: "/uploads/a.jpg" }],
  unitTypes: [{ id: 7, name: "Dwuosobowy", description: "", maxGuests: 2, basePriceGr: 20000 }],
};

beforeEach(() => {
  owner = {
    user: { id: 5 },
    property: { id: 3, name: "Willa Pod Dębem", slug: "willa", plan: "STANDARD" },
  };
  fullProperty = { ...BASE_PROPERTY };
  const config = buildDefaultConfig(BASE_PROPERTY as never, "nadmorski");
  site = {
    id: 21,
    propertyId: 3,
    subdomain: "willa",
    template: "nadmorski",
    customDomain: null,
    domainStatus: "NONE",
    draftConfig: config,
    publishedConfig: null,
  };
  takenSubdomains = new Map();
  domainOwner = null;
  saveError = null;
  domainCheckStatus = "PENDING";
  siteUpdates.length = 0;
  sitesCreated.length = 0;
  revalidated.length = 0;
  filesSaved.length = 0;
  domainCalls.length = 0;
  provider = {
    add: async (domain: string) => {
      domainCalls.push({ op: "add", domain });
    },
    check: async (domain: string) => {
      domainCalls.push({ op: "check", domain });
      return { status: domainCheckStatus, message: "", records: [] };
    },
    remove: async (domain: string) => {
      domainCalls.push({ op: "remove", domain });
    },
  };
});

describe("gating planów", () => {
  it("plan FREE nie ma dostępu do kreatora", async () => {
    owner.property.plan = "FREE";

    const to = await target(createSite(form({ template: "nadmorski", subdomain: "willa" })));

    expect(to).toContain("od planu Standard");
    expect(sitesCreated).toEqual([]);
  });

  it("bez utworzonej strony akcje edycji odmawiają", async () => {
    site = null;

    expect(await target(updateSiteSeo(form({ title: "X", description: "Y" })))).toContain(
      "Najpierw utwórz stronę"
    );
  });

  it("własna domena wymaga planu Pro", async () => {
    const to = await target(setCustomDomain(form({ domain: "willa.pl" })));

    expect(to).toContain("w planie Pro");
    expect(domainCalls).toEqual([]);
  });

  it("bez skonfigurowanego dostawcy domen akcja mówi wprost, czego brakuje", async () => {
    owner.property.plan = "PRO";
    provider = null;

    expect(await target(setCustomDomain(form({ domain: "willa.pl" })))).toContain(
      "nie jest skonfigurowane"
    );
  });
});

describe("createSite", () => {
  it("tworzy stronę z szablonu i wypełnia ją danymi obiektu", async () => {
    site = null;

    await target(createSite(form({ template: "nadmorski", subdomain: "moja-willa" })));

    expect(sitesCreated[0]).toMatchObject({
      propertyId: 3,
      subdomain: "moja-willa",
      template: "nadmorski",
    });
    const config = normalizeConfig(sitesCreated[0].draftConfig);
    expect(config.sections.length).toBeGreaterThan(0);
  });

  it("nowa strona nie ma wersji opublikowanej — jest niewidoczna dla gości", async () => {
    site = null;

    await target(createSite(form({ template: "nadmorski", subdomain: "moja-willa" })));

    expect(sitesCreated[0]).not.toHaveProperty("publishedConfig");
  });

  it("bez podanego adresu bierze slug obiektu", async () => {
    site = null;

    await target(createSite(form({ template: "nadmorski", subdomain: "" })));

    expect(sitesCreated[0]).toMatchObject({ subdomain: "willa" });
  });

  it("zajęty adres dostaje kolejny numer, zamiast odmowy", async () => {
    // przy zakładaniu nie zawracamy właściciela z pustymi rękami
    site = null;
    takenSubdomains.set("willa", { id: 99 });

    await target(createSite(form({ template: "nadmorski", subdomain: "willa" })));

    expect(String(sitesCreated[0].subdomain)).toMatch(/^willa-\d+$/);
  });

  it("za krótki adres jest odrzucany", async () => {
    site = null;

    expect(await target(createSite(form({ template: "nadmorski", subdomain: "ab" })))).toContain(
      "min. 3 znaki"
    );
    expect(sitesCreated).toEqual([]);
  });

  it("druga strona dla tego samego obiektu nie powstaje", async () => {
    const to = await target(createSite(form({ template: "nadmorski", subdomain: "inna" })));

    expect(to).toContain("już istnieje");
    expect(sitesCreated).toEqual([]);
  });

  it("nieznany szablon degraduje do domyślnego, zamiast wywracać kreator", async () => {
    site = null;

    await target(createSite(form({ template: "wymyslony", subdomain: "willa" })));

    expect(sitesCreated).toHaveLength(1);
    expect(String(sitesCreated[0].template).length).toBeGreaterThan(0);
  });

  it("nieznana paleta i font schodzą do wartości z szablonu", async () => {
    site = null;

    await target(
      createSite(form({ template: "nadmorski", subdomain: "willa", palette: "neonowa", font: "comic" }))
    );

    const config = normalizeConfig(sitesCreated[0].draftConfig);
    expect(config.theme.palette).not.toBe("neonowa");
    expect(config.theme.font).not.toBe("comic");
  });
});

describe("publikacja", () => {
  it("publikacja kopiuje szkic do wersji publicznej i stempluje datę", async () => {
    await target(publishSite());

    expect(siteUpdates[0].data.publishedConfig).toBeTruthy();
    expect(siteUpdates[0].data.publishedAt).toBeInstanceOf(Date);
  });

  it("publikacja odświeża publiczne adresy strony", async () => {
    // bez tego goście widzieliby starą wersję do wygaśnięcia cache'u
    await target(publishSite());

    expect(revalidated.length).toBeGreaterThan(1);
  });

  it("edycja szkicu NIE rusza wersji opublikowanej", async () => {
    // to jest cała istota podziału draft/published
    site!.publishedConfig = { sections: [], theme: {}, seo: {} };

    await target(updateSiteSeo(form({ title: "Nowy tytuł", description: "Nowy opis" })));

    expect(siteUpdates[0].data).not.toHaveProperty("publishedConfig");
    expect(Object.keys(siteUpdates[0].data)).toEqual(["draftConfig"]);
  });

  it("przywrócenie szkicu nadpisuje go wersją opublikowaną", async () => {
    const published = { sections: [], theme: {}, seo: { title: "Opublikowany" } };
    site!.publishedConfig = published;

    await target(revertSiteDraft());

    expect(siteUpdates[0].data).toEqual({ draftConfig: published });
  });

  it("nieopublikowanej strony nie da się przywrócić", async () => {
    site!.publishedConfig = null;

    expect(await target(revertSiteDraft())).toContain("nie była jeszcze publikowana");
    expect(siteUpdates).toEqual([]);
  });
});

describe("ustawienia wyglądu i SEO", () => {
  it("paleta i font spoza szablonu są ignorowane", async () => {
    const before = normalizeConfig(site!.draftConfig);

    await target(updateSiteTheme(form({ palette: "neonowa", font: "comic" })));

    const after = savedDraft();
    expect(after.theme.palette).toBe(before.theme.palette);
    expect(after.theme.font).toBe(before.theme.font);
  });

  it("zdjęcie tła musi być dodatnim identyfikatorem, inaczej zeruje wybór", async () => {
    await target(updateSiteTheme(form({ heroPhotoId: "91" })));
    expect(savedDraft().theme.heroPhotoId).toBe(91);

    await target(updateSiteTheme(form({ heroPhotoId: "-3" })));
    expect(savedDraft().theme.heroPhotoId).toBeNull();

    await target(updateSiteTheme(form({ heroPhotoId: "abc" })));
    expect(savedDraft().theme.heroPhotoId).toBeNull();
  });

  it("logo zapisuje się z prefiksem obiektu", async () => {
    const logo = new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" });

    await target(updateSiteTheme(form({ logo })));

    expect(filesSaved).toEqual(["p3-site"]);
    expect(savedDraft().theme.logoUrl).toBe("/uploads/p3-site-logo.png");
  });

  it("odrzucone logo wraca komunikatem i nie psuje szkicu", async () => {
    saveError = new Error("Zdjęcie może mieć maks. 8 MB.");
    const logo = new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" });

    const to = await target(updateSiteTheme(form({ logo })));

    expect(to).toContain("8 MB");
    expect(siteUpdates).toEqual([]);
  });

  it("usunięcie logo czyści je ze szkicu", async () => {
    await target(updateSiteTheme(form({ removeLogo: "1" })));

    expect(savedDraft().theme.logoUrl).toBeNull();
  });

  it("puste pole pliku nie kasuje istniejącego logo", async () => {
    // formularz wysyła pusty File, gdy właściciel nie wybrał nowego
    const empty = new File([], "", { type: "application/octet-stream" });
    site!.draftConfig = {
      ...normalizeConfig(site!.draftConfig),
      theme: { ...normalizeConfig(site!.draftConfig).theme, logoUrl: "/uploads/stare-logo.png" },
    };

    await target(updateSiteTheme(form({ logo: empty })));

    expect(savedDraft().theme.logoUrl).toBe("/uploads/stare-logo.png");
  });

  it("tytuł i opis SEO są przycinane do długości akceptowanej przez wyszukiwarki", async () => {
    await target(updateSiteSeo(form({ title: "x".repeat(200), description: "y".repeat(400) })));

    expect(savedDraft().seo.title).toHaveLength(70);
    expect(savedDraft().seo.description).toHaveLength(170);
  });

  it("własny CSS jest przycinany i nie trafia do szkicu, tylko do osobnej kolumny", async () => {
    await target(updateSiteCss(form({ css: "a".repeat(25000) })));

    expect(String(siteUpdates[0].data.customCss)).toHaveLength(20000);
    expect(siteUpdates[0].data).not.toHaveProperty("draftConfig");
  });
});

describe("sekcje strony", () => {
  const sectionId = () => normalizeConfig(site!.draftConfig).sections[0].id;

  it("edycja nagłówka przycina teksty i podstawia domyślne CTA", async () => {
    const hero = normalizeConfig(site!.draftConfig).sections.find((s) => s.type === "hero")!;

    await target(
      updateSiteSection(
        form({
          sectionId: hero.id,
          headline: "x".repeat(200),
          tagline: "y".repeat(300),
          ctaLabel: "",
        })
      )
    );

    const saved = savedDraft().sections.find((s) => s.id === hero.id)!;
    expect(saved.type).toBe("hero");
    if (saved.type === "hero") {
      expect(saved.data.headline).toHaveLength(120);
      expect(saved.data.tagline).toHaveLength(200);
      expect(saved.data.ctaLabel).toBe("Zarezerwuj pobyt");
    }
  });

  it("sekcja danych przyjmuje tylko tytuł, z domyślną etykietą przy pustym", async () => {
    const units = normalizeConfig(site!.draftConfig).sections.find((s) => s.type === "units")!;

    await target(updateSiteSection(form({ sectionId: units.id, title: "" })));

    const saved = savedDraft().sections.find((s) => s.id === units.id)!;
    if (saved.type === "units") expect(saved.data.title.length).toBeGreaterThan(0);
  });

  it("nieznana sekcja jest odrzucana", async () => {
    expect(await target(updateSiteSection(form({ sectionId: "nie-ma-takiej" })))).toContain(
      "Nie znaleziono sekcji"
    );
    expect(siteUpdates).toEqual([]);
  });

  it("przełącznik widoczności odwraca stan sekcji", async () => {
    const id = sectionId();
    const before = normalizeConfig(site!.draftConfig).sections[0].enabled;

    await target(toggleSiteSection(form({ sectionId: id })));

    expect(savedDraft().sections.find((s) => s.id === id)!.enabled).toBe(!before);
  });

  it("przesuwanie zmienia kolejność sekcji", async () => {
    const before = normalizeConfig(site!.draftConfig).sections.map((s) => s.id);

    await target(moveSiteSection(form({ sectionId: before[1], dir: "up" })));

    const after = savedDraft().sections.map((s) => s.id);
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
  });

  it("przesuwanie poza zakres nie rusza kolejności", async () => {
    const before = normalizeConfig(site!.draftConfig).sections.map((s) => s.id);

    await target(moveSiteSection(form({ sectionId: before[0], dir: "up" })));

    expect(siteUpdates).toEqual([]); // nic nie zapisujemy
  });

  it("dodaje sekcję znanego typu, odrzuca wymyślony", async () => {
    const before = normalizeConfig(site!.draftConfig).sections.length;

    await target(addSiteSection(form({ type: "customHtml" })));
    expect(savedDraft().sections).toHaveLength(before + 1);

    siteUpdates.length = 0;
    expect(await target(addSiteSection(form({ type: "karuzela3d" })))).toContain(
      "Nieznany typ sekcji"
    );
    expect(siteUpdates).toEqual([]);
  });

  it("limit 25 sekcji jest pilnowany", async () => {
    const config = normalizeConfig(site!.draftConfig);
    while (config.sections.length < 25) config.sections.push({ ...config.sections[0], id: `s${config.sections.length}` });
    site!.draftConfig = config;

    expect(await target(addSiteSection(form({ type: "customHtml" })))).toContain("maks. 25");
    expect(siteUpdates).toEqual([]);
  });

  it("usuwa wskazaną sekcję, nieistniejącą odrzuca", async () => {
    const id = sectionId();

    await target(removeSiteSection(form({ sectionId: id })));
    expect(savedDraft().sections.some((s) => s.id === id)).toBe(false);

    siteUpdates.length = 0;
    expect(await target(removeSiteSection(form({ sectionId: "nie-ma" })))).toContain(
      "Nie znaleziono sekcji"
    );
  });

  it("odpięcie sekcji zamienia ją na własny kod ze zrzutem treści, w tym samym miejscu", async () => {
    // właściciel przechodzi na ręczną edycję bez utraty tego, co widział
    const config = normalizeConfig(site!.draftConfig);
    const target_ = config.sections[1];

    await target(convertSectionToHtml(form({ sectionId: target_.id })));

    const saved = savedDraft().sections;
    expect(saved[1].type).toBe("customHtml");
    if (saved[1].type === "customHtml") expect(saved[1].data.html.length).toBeGreaterThan(0);
    expect(saved).toHaveLength(config.sections.length); // nie ubyło ani nie przybyło
  });

  it("sekcja już będąca własnym kodem nie jest konwertowana drugi raz", async () => {
    await target(addSiteSection(form({ type: "customHtml" })));
    const added = savedDraft().sections.at(-1)!;
    site!.draftConfig = savedDraft();
    siteUpdates.length = 0;

    expect(await target(convertSectionToHtml(form({ sectionId: added.id })))).toContain(
      "już jest własnym kodem"
    );
    expect(siteUpdates).toEqual([]);
  });
});

describe("updateSiteSubdomain", () => {
  it("zapisuje nowy adres i odświeża stary oraz nowy", async () => {
    // stary adres musi przestać oddawać treść, nowy zacząć
    await target(updateSiteSubdomain(form({ subdomain: "nowa-willa" })));

    expect(siteUpdates[0].data).toEqual({ subdomain: "nowa-willa" });
    expect(revalidated.length).toBeGreaterThan(1);
  });

  it("adres jest normalizowany do sluga", async () => {
    await target(updateSiteSubdomain(form({ subdomain: "Moja Willa!" })));

    expect(siteUpdates[0].data).toEqual({ subdomain: "moja-willa" });
  });

  it("zajęty adres jest ODRZUCANY, a nie numerowany", async () => {
    // przy zmianie właściciel wybiera świadomie — ciche „willa-2" byłoby
    // zaskoczeniem po tym, jak rozdał już wizytówki
    takenSubdomains.set("zajeta", { id: 99 });

    const to = await target(updateSiteSubdomain(form({ subdomain: "zajeta" })));

    expect(to).toContain("już zajęty");
    expect(siteUpdates).toEqual([]);
  });

  it("ten sam adres na tej samej stronie przechodzi", async () => {
    takenSubdomains.set("willa", { id: 21 });

    await target(updateSiteSubdomain(form({ subdomain: "willa" })));

    expect(siteUpdates).toHaveLength(1);
  });

  it("za krótki adres jest odrzucany", async () => {
    expect(await target(updateSiteSubdomain(form({ subdomain: "ab" })))).toContain("min. 3 znaki");
  });
});

describe("własna domena (plan Pro)", () => {
  beforeEach(() => {
    owner.property.plan = "PRO";
  });

  it("podpina domenę u dostawcy i zapisuje jej status", async () => {
    await target(setCustomDomain(form({ domain: "WWW.Willa.PL/kontakt" })));

    // adres jest normalizowany przed wysłaniem
    expect(domainCalls).toEqual([
      { op: "add", domain: "willa.pl" },
      { op: "check", domain: "willa.pl" },
    ]);
    expect(siteUpdates[0].data).toEqual({ customDomain: "willa.pl", domainStatus: "PENDING" });
  });

  it("niepoprawna domena nie idzie do dostawcy", async () => {
    expect(await target(setCustomDomain(form({ domain: "to nie domena" })))).toContain(
      "poprawną domenę"
    );
    expect(domainCalls).toEqual([]);
  });

  it("domena zweryfikowana na innej stronie jest nietykalna", async () => {
    // ochrona przed przejęciem cudzej działającej domeny
    domainOwner = { id: 99, domainStatus: "VERIFIED" };

    const to = await target(setCustomDomain(form({ domain: "willa.pl" })));

    expect(to).toContain("już zweryfikowana");
    expect(domainCalls).toEqual([]);
  });

  it("niezweryfikowany claim cudzej strony jest zwalniany", async () => {
    // ktoś wpisał domenę „na zapas" i nie potwierdził jej w DNS — nie może
    // tym blokować prawdziwego właściciela
    domainOwner = { id: 99, domainStatus: "PENDING" };

    await target(setCustomDomain(form({ domain: "willa.pl" })));

    expect(siteUpdates[0]).toEqual({ id: 99, data: { customDomain: null, domainStatus: "NONE" } });
    expect(siteUpdates[1].data).toMatchObject({ customDomain: "willa.pl" });
  });

  it("odświeżenie statusu zapisuje wynik sprawdzenia DNS", async () => {
    site!.customDomain = "willa.pl";
    site!.domainStatus = "PENDING";
    domainCheckStatus = "VERIFIED";

    await target(refreshDomainStatus());

    expect(domainCalls).toEqual([{ op: "check", domain: "willa.pl" }]);
    expect(siteUpdates[0].data).toEqual({ domainStatus: "VERIFIED" });
  });

  it("bez podpiętej domeny nie ma czego odświeżać ani usuwać", async () => {
    expect(await target(refreshDomainStatus())).toContain("Brak podpiętej domeny");
    expect(await target(removeCustomDomain())).toContain("Brak podpiętej domeny");
    expect(domainCalls).toEqual([]);
  });

  it("odłączenie usuwa domenę u dostawcy i czyści ją w bazie", async () => {
    site!.customDomain = "willa.pl";
    site!.domainStatus = "VERIFIED";

    await target(removeCustomDomain());

    expect(domainCalls).toEqual([{ op: "remove", domain: "willa.pl" }]);
    expect(siteUpdates[0].data).toEqual({ customDomain: null, domainStatus: "NONE" });
  });

  it("odłączenie odświeża adresy, pod którymi strona działała", async () => {
    // inaczej stara domena oddawałaby treść z cache'u po odpięciu
    site!.customDomain = "willa.pl";

    await target(removeCustomDomain());

    expect(revalidated.length).toBeGreaterThan(0);
  });
});
