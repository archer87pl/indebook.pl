# Moduł „Strona WWW" — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kreator stron WWW obiektów w panelu (`/admin/strona`) publikujący strony na `*.rezop.pl` i własnych domenach (Vercel), wg specu `docs/superpowers/specs/2026-07-23-website-builder-design.md`.

**Architecture:** Rekord `Site` (1:1 z `Property`) z konfiguracją JSON draft/published; `proxy.ts` mapuje hosta na rewrite do `app/_sites/[host]` renderującego stronę komponentami React (ISR + revalidatePath przy publikacji). Edytor = server components + server actions (wzorzec `requireOwner` → `redirect(?error=)` / `revalidatePath` + `redirect(?saved=1)`), podgląd draftu w iframe. Domeny za interfejsem `DomainProvider` (impl. Vercel API).

**Tech Stack:** Next.js 16.2 (App Router, `proxy.ts`, async params), Prisma + Postgres (Supabase), Tailwind 4, Vercel Blob (zdjęcia — już jest), `sanitize-html` (jedyna nowa zależność), vitest + playwright.

## Global Constraints

- Next.js 16: middleware to **`proxy.ts`** (named export `proxy`, Node runtime); `params`/`searchParams` są `Promise` — zawsze `await`; ISR modelem legacy (`export const revalidate`, `revalidatePath`) — projekt NIE używa `cacheComponents`.
- Wzorce kodu: akcje w stylu `lib/actions.ts` (FormData, `str()`, `redirect(?error=)`, `revalidatePath` + `redirect(?saved=1)`); zdjęcia = pełne URL-e Blob w `Photo.path`, renderowane `<img loading="lazy">` (świadome odstępstwo od next/image — spójność z kodem, Blob wymagałby remotePatterns); ceny w groszach, `formatPln` z `lib/format`; UI: Tailwind + klasy `.card`, `.alert-error`, `.alert-success`, komponenty `components/ui/*` (`SubmitButton`, `Card`, `Toggle`); ikony lucide-react; teksty UI po polsku.
- Gating planów: STANDARD/PRO = kreator + subdomena, PRO = własna domena, FREE = upsell. Jedna funkcja `sitePlanFeatures`.
- Brak duplikacji danych: sekcje `units/gallery/amenities/calendar/reviews` czytają dane z tabel RezOp na żywo; w JSON tylko ustawienia wyglądu.
- Env: `SITES_BASE_DOMAIN` (domyślnie `rezop.pl`), `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, opcjonalnie `VERCEL_TEAM_ID`; brak tokenów = sekcja domen ukryta (wzorzec „tryb symulacji" jak P24).
- Testy: vitest dla czystej logiki (`lib/*.test.ts`, polskie opisy), playwright e2e (`tests/e2e/`, helper `loginAsOwner`, port 3100, subdomeny `*.localhost`).
- Commity małe, po polsku, konwencja repo (`Feat:`/`Fix:`/opisowe).

---

### Task 1: Fundament danych — model `Site`, motywy, konfiguracja, gating planów

**Files:**
- Modify: `prisma/schema.prisma` (model `Site`, relacja w `Property`)
- Create: `lib/site-themes.ts`, `lib/site-config.ts`, `lib/site-config.test.ts`
- Modify: `lib/plans.ts` (`sitePlanFeatures` + wpisy features), Create: `lib/plans.test.ts`

**Interfaces (Produces):**
- Prisma: `Site { id, propertyId (unique), subdomain (unique), customDomain? (unique), domainStatus ("NONE"|"PENDING"|"VERIFIED"|"ERROR"), template, draftConfig Json, publishedConfig Json?, customCss String @default(""), publishedAt?, createdAt, updatedAt }`, `Property.site Site?`
- `lib/site-config.ts`:
  - typy: `SectionType`, `SiteSection` (unia dyskryminowana po `type`: `hero{headline,tagline,ctaLabel,photoId}`, `about{title,html}`, `units{title}`, `gallery{title}`, `amenities{title}`, `calendar{title}`, `attractions{title,items:{name,desc,distance}[]}`, `reviews{title}`, `contact{title,intro}`, `customHtml{html}`; każda sekcja `{id: string, type, enabled: boolean, data}`), `SiteTheme {palette, font, logoUrl: string|null, heroPhotoId: number|null}`, `SiteSeo {title, description}`, `SiteConfig {theme, seo, sections}`
  - `normalizeConfig(raw: unknown): SiteConfig` — toleruje braki/śmieci, uzupełnia defaulty, odrzuca nieznane typy sekcji (forward-compat)
  - `buildDefaultConfig(property: PropertyWithData, template: string): SiteConfig` — prefill z danych obiektu (nazwa→headline, description→about, wszystkie sekcje danych enabled, attractions puste-disabled, customHtml brak)
  - `newSection(type: SectionType): SiteSection` (defaulty + losowe `id` przez `sid()`), `SECTION_LABELS: Record<SectionType,string>` (po polsku), `sid(): string`
- `lib/site-themes.ts`: `SITE_TEMPLATES: SiteTemplate[]` (`gorski|nadmorski|miejski|uniwersalny`, każdy: `label`, `blurb`, `palettes: SitePalette[]` (3/szablon: `{key,label,bg,surface,text,muted,primary,primaryText,accent}` — wartości hex), `defaultPalette`, `defaultFont`); `SITE_FONTS: Record<string,{label, css}>` (`sans`, `serif`, `display` — stosy systemowe + `var(--font-space-grotesk)`); `findPalette(template, key): SitePalette` (fallback pierwsza); `themeVars(theme): Record<string,string>` → `--site-bg`, `--site-surface`, `--site-text`, `--site-muted`, `--site-primary`, `--site-primary-text`, `--site-accent`, `--site-font`
- `lib/plans.ts`: `sitePlanFeatures(plan: string): { builder: boolean; customDomain: boolean }`

**Steps:**
- [ ] 1. Testy `lib/site-config.test.ts`: `normalizeConfig({})` daje pełny config z defaultami; nieznany typ sekcji odrzucany; `buildDefaultConfig` mapuje nazwę/opis obiektu i włącza sekcje danych; `newSection("attractions")` ma puste `items`. Testy `lib/plans.test.ts` dla `sitePlanFeatures` (FREE/STANDARD/PRO).
- [ ] 2. `npx vitest run lib/site-config.test.ts lib/plans.test.ts` → FAIL (brak modułów).
- [ ] 3. Implementacja `site-themes.ts`, `site-config.ts`, `sitePlanFeatures` + dopisanie do `PLANS[].features`: STANDARD „własna strona WWW obiektu (subdomena)", PRO „własna domena strony WWW".
- [ ] 4. Vitest → PASS. Schema: dodać model `Site`, `npx prisma db push` + `npx prisma generate`.
- [ ] 5. Commit `Feat: strona WWW - model Site, konfiguracja i motywy`.

### Task 2: Sanityzacja HTML

**Files:** Create: `lib/sanitize.ts`, `lib/sanitize.test.ts`; Modify: `package.json` (dep `sanitize-html`, dev `@types/sanitize-html`)

**Interfaces (Produces):**
- `sanitizeRichText(html: string): string` — pola opisowe: `p,br,b,strong,i,em,u,a,ul,ol,li,h3,h4`; `a` tylko `href` (`https`,`http`,`mailto`,`tel`) + wymuszone `rel="noopener"`.
- `sanitizeCustomHtml(html: string): string` — sekcja „Własny kod": szersza allowlista (`div,span,section,article,figure,figcaption,img,table,thead,tbody,tr,td,th,h1..h6,blockquote,hr` + rich), atrybuty `class,style,src,alt,width,height,href`; `iframe` tylko z `src` z hostów `youtube.com,youtube-nocookie.com,maps.google.com,google.com/maps,openstreetmap.org`; nigdy `script`, zdarzenia `on*`, `javascript:`.
- `sanitizeCss(css: string): string` — usuwa sekwencję `</style` (case-insensitive) i znaki `<`.

**Steps:**
- [ ] 1. `npm i sanitize-html && npm i -D @types/sanitize-html`.
- [ ] 2. Testy: wycina `<script>`, `onclick`, `javascript:href`; zachowuje `<b>`, listy, dozwolony iframe YouTube; tnie iframe z obcego hosta; `sanitizeCss` neutralizuje `</style><script>`.
- [ ] 3. Vitest FAIL → implementacja → PASS.
- [ ] 4. Commit `Feat: strona WWW - sanityzacja HTML (sanitize-html)`.

### Task 3: Routing hostów — `lib/site-host.ts` + `proxy.ts`

**Files:** Create: `lib/site-host.ts`, `lib/site-host.test.ts`, `proxy.ts` (root)

**Interfaces (Produces):**
```ts
export type HostKind = { kind: "app" } | { kind: "site"; key: string }; // key = subdomena LUB pełna domena własna
export function sitesBaseDomain(): string; // env SITES_BASE_DOMAIN ?? "rezop.pl"
export function classifyHost(hostHeader: string | null, opts?: { base?: string; appHost?: string }): HostKind;
export function siteUrl(site: { subdomain: string; customDomain: string | null; domainStatus: string }): string; // kanoniczny publiczny URL strony
```
Reguły `classifyHost` (host bez portu, lowercase): pusty/`localhost`/`127.0.0.1`/host z `APP_URL`/równy bazie → `app`; `x.localhost` → `{site, key:"x"}` (dev); `x.<base>` → `{site, key:"x"}` (bez zagnieżdżeń — `a.b.<base>` → app); inaczej → `{site, key: host}` (własna domena; lookup obsłuży wariant bez `www.`).

`proxy.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { classifyHost } from "@/lib/site-host";

export function proxy(request: NextRequest) {
  const kind = classifyHost(request.headers.get("host"));
  if (kind.kind === "app") return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = `/_sites/${kind.key}${url.pathname === "/" ? "" : url.pathname}`;
  return NextResponse.rewrite(url);
}
export const config = {
  matcher: ["/((?!_next/|api/|favicon.ico|icon|uploads/).*)"],
};
```
(`/api/*` przechodzi bez rewrite'u — widget kalendarza i formularz kontaktowy biją w API z domeny strony.)

**Steps:**
- [ ] 1. Testy `classifyHost`: localhost→app, `willa.localhost:3000`→site/willa, `willa.rezop.pl`→site/willa, `rezop.pl`→app, `app-host z APP_URL`→app, `mojobiekt.pl`→site/mojobiekt.pl, `a.b.rezop.pl`→app. FAIL → implementacja → PASS.
- [ ] 2. `proxy.ts` jak wyżej; `npm run build` przechodzi.
- [ ] 3. Commit `Feat: strona WWW - routing hostow (proxy + classifyHost)`.

### Task 4: Publiczny rendering strony — `app/_sites/[host]`

**Files:**
- Create: `lib/sites.ts` (DB), `components/site/SiteRenderer.tsx`, `components/site/sections/{Hero,About,Units,Gallery,GalleryLightbox(client),Amenities,Attractions,Reviews,Contact(placeholder),CustomHtml}.tsx`, `components/site/{SiteNav,SiteFooter}.tsx`, `app/_sites/[host]/page.tsx`
- Test: brak nowych unit testów (logika czysta pokryta w Task 1–3); weryfikacja manualna + e2e w Task 10

**Interfaces:**
- Consumes: `normalizeConfig`, `themeVars`, `findPalette`, `sanitizeRichText/CustomHtml/Css`, `classifyHost` — z Task 1–3.
- Produces (`lib/sites.ts`):
```ts
export type SiteWithData = Site & { property: Property & { photos: Photo[]; faqs: PropertyFaq[]; unitTypes: (UnitType & { units: Unit[]; photos: Photo[] })[] } };
export async function getSiteByKey(key: string): Promise<SiteWithData | null>; // subdomain=key OR customDomain=key OR customDomain=key bez "www."
export function siteRevalidatePaths(site: Site): string[]; // ["/_sites/<subdomain>", "/_sites/<customDomain>"?]
```
- `SiteRenderer({ site, config, preview }: { site: SiteWithData; config: SiteConfig; preview?: boolean })` — server component: wrapper `<div style={themeVars(...)} className="site-root">`, `<SiteNav>` (logo/nazwa + kotwice do włączonych sekcji + CTA „Zarezerwuj" → `${appUrl()}/o/${slug}`), sekcje wg `config.sections` (`enabled` only), `<SiteFooter>` (adres, kontakt-mail właściciela pomijamy — dane z `Property`: address, check-in/out, linki do `${appUrl()}/o/${slug}/regulamin`), `<style>` z `sanitizeCss(site.customCss)`.
- Sekcje danych czytają z `site.property` (bez własnych zapytań); `Reviews` robi własny `prisma.review.findMany({ where: { propertyId, hidden: false }, orderBy: { createdAt: "desc" }, take: 9 })` + `averageRating` z `lib/reviews`. `Units`: karty (zdjęcie, nazwa, `maxGuests`, `formatPln(basePriceGr)`/noc, badges z `lib/amenities`, CTA → `${appUrl()}/o/${slug}/pokoj/${id}`). `Gallery`: grid zdjęć obiektu + lightbox (mały client component, `useState`). `Contact`: w tym tasku placeholder — pełny w Task 6.
- `app/_sites/[host]/page.tsx`: `export const revalidate = 300`; `const { host } = await params`; brak strony/`publishedConfig` → `notFound()`; `property.suspended` → karta „Strona chwilowo niedostępna"; `generateMetadata` (title/description z `config.seo`, fallback nazwa+adres; OG image = zdjęcie hero; `alternates.canonical = siteUrl(site)`); JSON-LD `LodgingBusiness` (name, address, image, priceRange od min `basePriceGr`) przez `dangerouslySetInnerHTML` (wzorzec z `o/[slug]`).

**Steps:**
- [ ] 1. `lib/sites.ts` + sekcje statyczne + renderer + page (styl: czysty Tailwind na zmiennych `--site-*`, mobile-first, sekcje `<section id={type}>`).
- [ ] 2. Ręczna weryfikacja w przeglądarce (preview_start): seedowany obiekt, wstawić do DB testowy `Site` skryptem tsx w scratchpadzie (`buildDefaultConfig` + publish), otworzyć `http://<subdomain>.localhost:3000/` — strona się renderuje, brak błędów konsoli.
- [ ] 3. `npm run build` przechodzi. Commit `Feat: strona WWW - publiczny rendering (_sites/[host])`.

### Task 5: Widget kalendarza i cen

**Files:** Create: `app/api/sites/availability/route.ts`, `components/site/sections/Calendar.tsx` (client)

**Interfaces:**
- GET `/api/sites/availability?unitTypeId=<int>&month=<YYYY-MM>` → `{ days: { date: string; free: number; priceGr: number }[] }`; 400 przy złych parametrach; liczone z `conflictingReservationWhere`/blocków (`lib/availability.ts`) jednym zapytaniem na zakres miesiąca + ceny: `RateSeason` obiektu (jeśli `lib/pricing` ma helper ceny dnia — użyć go; w przeciwnym razie prosta funkcja lokalna season-lookup → `basePriceGr`).
- `Calendar.tsx`: props `{ unitTypes: {id, name}[]; title: string }`; select typu, nawigacja miesięcy, grid dni (wolne=klik, zajęte=wyszarzone, cena pod dniem), klik start/koniec zakresu → przycisk „Zarezerwuj <daty>" linkujący `${appUrl}/rezerwuj/<unitTypeId>?from&to&guests=2` (appUrl przekazany propsem z serwera).

**Steps:**
- [ ] 1. Route + komponent; podpiąć w `SiteRenderer` (przekazać `unitTypes` i `appUrl` z serwera).
- [ ] 2. Weryfikacja w przeglądarce: miesiąc się ładuje, dni z rezerwacjami zajęte (sprawdzić względem `/admin/kalendarz`), link rezerwacji prowadzi do działającego flow.
- [ ] 3. Commit `Feat: strona WWW - widget kalendarza dostepnosci i cen`.

### Task 6: Formularz kontaktowy + mapa

**Files:** Create: `app/api/sites/inquiry/route.ts`; Rewrite: `components/site/sections/Contact.tsx` (client form + mapa)

**Interfaces:**
- POST `/api/sites/inquiry` JSON `{ siteKey, name, email, phone?, message, website }` (`website` = honeypot, wypełniony → 200 bez wysyłki); walidacja: email regex, message 10–2000 znaków; wysyłka `sendMail` (`lib/mailer.ts`) do e-maila właściciela (`site.property.owner.email` — include w zapytaniu), `replyTo` gościa; 429-light: bez dodatkowej infrastruktury w MVP.
- `Contact.tsx`: formularz (imię, e-mail, telefon, wiadomość, honeypot ukryty CSS), fetch POST, stany wysyłania/sukcesu/błędu inline; obok mapa `<iframe src={"https://maps.google.com/maps?q=" + encodeURIComponent(address) + "&output=embed"}>` (keyless; świadome odstępstwo od OSM ze specu — OSM embed wymaga współrzędnych, których `Property` nie ma) + adres i godziny zameldowania.

**Steps:**
- [ ] 1. Route + komponent, podpięcie w rendererze.
- [ ] 2. Weryfikacja: wysłany formularz → 200 + stan sukcesu; log maila w dev (Resend nieskonfigurowany = mailer loguje); honeypot nie wysyła.
- [ ] 3. Commit `Feat: strona WWW - formularz kontaktowy i mapa`.

### Task 7: Panel — akcje bazowe, wizard, podgląd, nawigacja

**Files:**
- Create: `lib/site-actions.ts` ("use server"), `app/admin/strona/page.tsx`, `components/admin/site/SiteWizard.tsx` (client), `app/podglad-strony/page.tsx` (poza layoutami admin/site — sam root layout)
- Modify: `app/admin/layout.tsx` (NAV + `{ href: "/admin/strona", label: "Strona WWW", icon: "Globe" }`), `components/admin/AdminNav.tsx` (ikona `Globe` do `ICONS`)

**Interfaces (Produces — wszystkie akcje wzorcem `requireOwner` → walidacja → `redirect("/admin/strona?error=…")` | `revalidatePath` + `redirect("/admin/strona?saved=1")`; gating: `sitePlanFeatures(property.plan).builder` albo redirect z błędem):**
```ts
export async function createSite(formData: FormData): Promise<void>;      // template, palette, font, subdomain; buildDefaultConfig + slugify/unikalność subdomeny
export async function publishSite(): Promise<void>;                        // draft→published, publishedAt, revalidatePath(siteRevalidatePaths)
export async function revertSiteDraft(): Promise<void>;                    // published→draft
export async function updateSiteTheme(formData: FormData): Promise<void>;  // palette, font, heroPhotoId, logoUrl(opcjonalny upload przez savePhotoFile)
export async function updateSiteSeo(formData: FormData): Promise<void>;
export async function updateSiteCss(formData: FormData): Promise<void>;
export async function updateSiteSubdomain(formData: FormData): Promise<void>; // slugify, unikat, revalidate stare+nowe ścieżki
```
- `app/admin/strona/page.tsx` (server): FREE → karta upsellu (features + link `/admin/plan`); brak `Site` → `<SiteWizard templates={SITE_TEMPLATES} fonts={SITE_FONTS} suggestedSubdomain={property.slug} dataSummary={{photos, unitTypes, hasDescription…}} />`; jest `Site` → edytor (w tym tasku: pasek publikacji ze statusem „nieopublikowane zmiany" gdy `draftConfig !== publishedConfig` (porównanie JSON.stringify), link do strony live `siteUrl(site)`, karty Wygląd/SEO/Zaawansowane/Adres — formularze do powyższych akcji; lista sekcji dojdzie w Task 8) + `<PreviewPane>` (Task 8; tu zwykły link do podglądu).
- `SiteWizard`: 4 kroki client-side (szablon → dane → personalizacja → adres), stan lokalny, submit jednego `<form action={createSite}>` z hidden inputs.
- `app/podglad-strony/page.tsx`: `export const dynamic = "force-dynamic"`; `requireOwner()`; renderuje `SiteRenderer` z `normalizeConfig(site.draftConfig)` + `preview`.

**Steps:**
- [ ] 1. Akcje + wizard + strona + nav + podgląd.
- [ ] 2. Weryfikacja w przeglądarce: pełny przebieg wizarda → edytor; publikacja → strona na `http://<sub>.localhost:3000/`; zmiana w drafcie widoczna w podglądzie, a nie na live; „Cofnij" przywraca.
- [ ] 3. `npm run build`. Commit `Feat: strona WWW - modul panelu (wizard, publikacja, podglad)`.

### Task 8: Panel — edytor sekcji

**Files:**
- Modify: `lib/site-actions.ts`, `app/admin/strona/page.tsx`
- Create: `components/admin/site/SectionEditor.tsx` (server — accordion listy sekcji z formularzami per typ), `components/admin/site/PreviewPane.tsx` (client — iframe `/podglad-strony`, przełącznik desktop/mobile szerokością, przycisk odśwież), `lib/site-static-html.ts`

**Interfaces:**
```ts
// site-actions.ts — nowe akcje (wszystkie FormData z hidden "sectionId" gdzie dotyczy):
export async function updateSiteSection(formData: FormData): Promise<void>; // switch po type: pola tekstowe; attractions: textarea "Nazwa | opis | odległość" per linia; customHtml: textarea (sanityzacja przy renderze, nie zapisie)
export async function toggleSiteSection(formData: FormData): Promise<void>;
export async function moveSiteSection(formData: FormData): Promise<void>;   // dir=up|down
export async function addSiteSection(formData: FormData): Promise<void>;    // type z selecta (newSection)
export async function removeSiteSection(formData: FormData): Promise<void>;
export async function convertSectionToHtml(formData: FormData): Promise<void>; // renderSectionHtml → zamiana na customHtml
// lib/site-static-html.ts:
export function renderSectionHtml(section: SiteSection, ctx: { property: SiteWithData["property"] }): string; // uproszczony statyczny HTML sekcji (świadomie prostszy niż React — punkt startowy dla użytkownika)
```
- `SectionEditor`: per sekcja `<details>` z nagłówkiem (label, Toggle widoczności, ↑↓, usuń, „Konwertuj na własny kod" przy sekcjach generowanych — z `confirm` przez `onSubmit`? Nie — server-side: link do `?confirmDetach=<id>` pokazujący kartę potwierdzenia), w środku `<form action={updateSiteSection}>` z polami typu + `SubmitButton` „Zapisz".

**Steps:**
- [ ] 1. Vitest dla `renderSectionHtml` (hero/about/attractions produkują sensowny HTML z danymi) — FAIL → implementacja → PASS.
- [ ] 2. Akcje sekcji + UI + PreviewPane; podpiąć w `app/admin/strona/page.tsx` (layout: lewa kolumna edytor, prawa podgląd sticky, mobile: podgląd pod spodem).
- [ ] 3. Weryfikacja w przeglądarce: edycja pól, kolejność, toggle, dodanie „Własny kod" z `<script>` (wycięty na stronie), konwersja sekcji z ostrzeżeniem.
- [ ] 4. Commit `Feat: strona WWW - edytor sekcji z podgladem`.

### Task 9: Własne domeny (PRO)

**Files:** Create: `lib/domains.ts`, `lib/domains.test.ts`, `components/admin/site/DomainPanel.tsx` (server); Modify: `lib/site-actions.ts`, `app/admin/strona/page.tsx`, `.env.example`

**Interfaces:**
```ts
// lib/domains.ts
export type DomainDnsRecord = { type: "A" | "CNAME" | "TXT"; name: string; value: string };
export type DomainCheck = { status: "PENDING" | "VERIFIED" | "ERROR"; message: string; records: DomainDnsRecord[] };
export interface DomainProvider { add(domain: string): Promise<void>; check(domain: string): Promise<DomainCheck>; remove(domain: string): Promise<void>; }
export function domainProvider(): DomainProvider | null; // null gdy brak VERCEL_TOKEN/VERCEL_PROJECT_ID
export function mapVercelStatus(projectDomain: unknown, domainConfig: unknown): DomainCheck; // czysta, testowalna
export function normalizeDomain(input: string): string | null; // lowercase, bez schematu/ścieżki/www., walidacja kształtu
```
- Vercel impl: `add` = POST `/v10/projects/{pid}/domains` `{name}` + drugi POST `{name: "www."+d, redirect: d}`; `check` = GET `/v9/projects/{pid}/domains/{d}` (verified, verification[]) + GET `/v6/domains/{d}/config` (misconfigured) → `mapVercelStatus`; wszystkie z `?teamId=` gdy `VERCEL_TEAM_ID`. Rekordy domyślne: `A @ 76.76.21.21`, `CNAME www cname.vercel-dns.com` + TXT z verification[].
- Akcje: `setCustomDomain(formData)` (gate `sitePlanFeatures(...).customDomain`, `normalizeDomain`, unikat w DB, `provider.add`, status PENDING), `refreshDomainStatus()` (check → update `domainStatus`), `removeCustomDomain()` (provider.remove obu wariantów, czyszczenie pól, revalidate).
- `DomainPanel`: ukryty gdy `domainProvider() === null`; STANDARD → notka „dostępne w PRO"; PRO → formularz domeny / status (Oczekuje/Zweryfikowana/Błąd) + tabela rekordów DNS + instrukcja krok-po-kroku + przyciski Odśwież status / Odepnij.
- `.env.example`: dopisać `SITES_BASE_DOMAIN`, `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` z komentarzami PL.

**Steps:**
- [ ] 1. Testy `normalizeDomain` (https://www.Mojobiekt.pl/x → mojobiekt.pl; śmieci → null) i `mapVercelStatus` (verified+ok→VERIFIED; verification pending→PENDING z TXT; misconfigured→ERROR) — FAIL → implementacja → PASS.
- [ ] 2. Akcje + panel + env; build przechodzi (bez tokenów panel ukryty — sprawdzić w przeglądarce).
- [ ] 3. Commit `Feat: strona WWW - wlasne domeny (DomainProvider/Vercel)`.

### Task 10: SEO per host, e2e, dokumentacja

**Files:**
- Create: `app/_sites/[host]/sitemap.xml/route.ts`, `app/_sites/[host]/robots.txt/route.ts`, `tests/e2e/site-builder.spec.ts`
- Modify: `docs/FUNKCJE.md` (sekcja modułu), `README.md` (wzmianka + env), `BIZNES.md` bez zmian (chyba że lista funkcji planów — dopisać)

**Interfaces:**
- `sitemap.xml/route.ts`: `GET(_req, { params })` → `await params`, `getSiteByKey` → XML z jednym `<url>` (canonical `siteUrl(site)`), 404 gdy brak; `robots.txt`: `User-agent: * / Allow: /` + `Sitemap: <canonical>/sitemap.xml`.
- e2e (`workers:1`, helper `loginAsOwner`): ustaw plan Standard przez `/admin/plan`; `/admin/strona` → wizard (wybór szablonu, dalej×3, unikalna subdomena z `RUN`) → edytor widoczny → Publikuj → `page.goto("http://<sub>.localhost:3100/")` → widoczny nagłówek hero i sekcja apartamentów; FREE-gating: po powrocie na FREE `/admin/strona` pokazuje upsell (na końcu przywrócić plan).

**Steps:**
- [ ] 1. Route'y sitemap/robots; sprawdzić `curl http://<sub>.localhost:3000/sitemap.xml`.
- [ ] 2. Spec e2e → `npx playwright test tests/e2e/site-builder.spec.ts` PASS.
- [ ] 3. Pełne `npm run test` + `npm run build` + `npx tsc --noEmit` (jeśli używane) — wszystko zielone.
- [ ] 4. Dokumentacja (FUNKCJE.md — opis modułu po polsku w stylu istniejących sekcji; README env). Commit `Feat: strona WWW - SEO per host, testy e2e i dokumentacja`.

---

## Self-review planu

- Pokrycie specu: model+draft/publish (T1), sanityzacja/bezpieczeństwo (T2), routing hostów (T3), rendering+sekcje+JSON-LD+metadata (T4), kalendarz hybrydowy (T5), kontakt+mapa (T6), wizard/publikacja/podgląd/gating (T7), edytor+odpięcie sekcji+CSS (T8), domeny+DNS+SSL-via-Vercel+env (T9), sitemap/robots+e2e+docs (T10). Cookie sesji: `rezio_session` jest ustawiane bez atrybutu `Domain` (host-only) — do potwierdzenia w T7 przy przeglądzie `lib/auth.ts`, bez zmian jeśli tak jest.
- Odstępstwa od specu (świadome, do odnotowania przy realizacji): `<img loading="lazy">` zamiast next/image (konwencja repo), mapa Google embed zamiast OSM (brak współrzędnych w danych), formularz kontaktowy przez API route zamiast server action (rewrite hostów), lightbox minimalny.
