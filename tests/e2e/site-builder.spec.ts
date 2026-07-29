import { expect, test, type Page } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { RUN, loginAsOwner, PROPERTY_SLUG } from "./helpers";

// Moduł „Strona WWW": gating planów → wizard → edytor sekcji → publikacja →
// strona live na subdomenie (*.localhost, przez proxy hostów).
// Testy sięgają do DB (reset stanu strony), stąd ładowanie .env.
loadEnvConfig(process.cwd());

type Db = typeof import("../../lib/db");
let prisma: Db["prisma"];

test.describe("kreator strony WWW", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    ({ prisma } = await import("../../lib/db"));
    const property = await prisma.property.findUniqueOrThrow({
      where: { slug: PROPERTY_SLUG },
    });
    await prisma.site.deleteMany({ where: { propertyId: property.id } });
    await prisma.property.update({
      where: { id: property.id },
      data: { plan: "STANDARD" },
    });
  });

  test("plan FREE widzi zachętę do upgrade'u zamiast kreatora", async ({ page }) => {
    await prisma.property.update({
      where: { slug: PROPERTY_SLUG },
      data: { plan: "FREE" },
    });
    await loginAsOwner(page);
    await page.goto("/admin/strona");
    await expect(page.getByText("Zobacz plany od Standard")).toBeVisible();
    await prisma.property.update({
      where: { slug: PROPERTY_SLUG },
      data: { plan: "STANDARD" },
    });
  });

  test("wizard tworzy stronę, edytor zapisuje, publikacja wystawia subdomenę", async ({
    page,
  }) => {
    const sub = `e2e-strona-${RUN}`;
    const headline = `Nagłówek E2E ${RUN}`;

    await loginAsOwner(page);
    await page.goto("/admin/strona");

    // wizard: szablon → dane → wygląd → adres
    await expect(page.getByText("Wybierz szablon startowy")).toBeVisible();
    await page.getByRole("button", { name: /Górski \/ rustykalny/ }).click();
    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.getByText("Stronę wypełnimy Twoimi danymi")).toBeVisible();
    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.getByText("Dopasuj wygląd")).toBeVisible();
    await page.getByRole("button", { name: "Dalej" }).click();
    await page.getByLabel("Subdomena").fill(sub);
    await page.getByRole("button", { name: "Utwórz stronę" }).click();

    // edytor widoczny, prefill z danych obiektu
    await expect(page.getByText("Sekcje strony")).toBeVisible();
    await expect(page.getByText("Masz nieopublikowane zmiany")).toHaveCount(0);

    // edycja nagłówka hero — sukces sygnalizuje toast (parametr ?saved=1 jest
    // zdejmowany z URL przez Toaster, więc czekamy na powiadomienie)
    await page.locator("summary", { hasText: "Nagłówek (hero)" }).click();
    await page.locator('input[name="headline"]').fill(headline);
    await page.getByRole("button", { name: "Zapisz sekcję" }).first().click();
    await expect(page.getByText("Zapisano zmiany.")).toBeVisible();

    // publikacja
    await page.getByRole("button", { name: /Opublikuj/ }).click();
    await expect(page.getByRole("link", { name: "Zobacz na żywo" })).toBeVisible();

    // strona live na subdomenie; poll — ISR ma semantykę stale-while-revalidate.
    // Uwaga: page.request działa z Node'a, który nie rozwiązuje *.localhost —
    // stąd localhost + nagłówek Host (proxy hostów patrzy na nagłówek).
    const hostHeaders = { Host: `${sub}.localhost` };
    await expect
      .poll(
        async () => {
          const res = await page.request.get("http://localhost:3100/", {
            headers: hostHeaders,
          });
          return res.ok() ? (await res.text()).includes(headline) : false;
        },
        { timeout: 20_000 }
      )
      .toBe(true);

    // pełny rendering: apartamenty + kalendarz + stopka
    await page.goto(`http://${sub}.localhost:3100/`);
    await expect(page.getByRole("heading", { name: headline })).toBeVisible();
    await expect(page.getByText("Nasze apartamenty")).toBeVisible();
    await expect(page.getByText("Dostępność i ceny")).toBeVisible();
    // widget kalendarza zhydratowany (client component wystartował bez błędu)
    await expect(page.getByText("Kliknij dzień przyjazdu i wyjazdu")).toBeVisible();
    await expect(page.getByText("Strona stworzona w")).toBeVisible();

    // sitemap i robots per host
    const sitemap = await page.request.get("http://localhost:3100/sitemap.xml", {
      headers: hostHeaders,
    });
    expect(sitemap.ok()).toBe(true);
    expect(await sitemap.text()).toContain("<urlset");
    const robots = await page.request.get("http://localhost:3100/robots.txt", {
      headers: hostHeaders,
    });
    expect(await robots.text()).toContain("Allow: /");
  });

  test("przełącznik języka tłumaczy chrome strony, treść właściciela zostaje", async ({
    page,
  }) => {
    const sub = `e2e-strona-${RUN}`;
    const headline = `Nagłówek E2E ${RUN}`;
    await page.goto(`http://${sub}.localhost:3100/`);

    // start po polsku
    await expect(page.getByRole("link", { name: "Apartamenty" })).toBeVisible();

    await page.getByRole("button", { name: "EN", exact: true }).click();

    // etykiety systemowe po angielsku (nawigacja, widget kalendarza)…
    await expect(page.getByRole("link", { name: "Apartments" })).toBeVisible();
    await expect(page.getByText("Click your arrival and departure dates")).toBeVisible();
    // …a treść właściciela (nagłówek hero, tytuły sekcji z wizarda) zostaje
    // w oryginale — tłumaczymy tylko chrome
    await expect(page.getByRole("heading", { name: headline })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nasze apartamenty" })).toBeVisible();

    // wybór jest zapamiętany w cookie SITE_LOCALE i przeżywa przeładowanie
    const cookie = (await page.context().cookies()).find((c) => c.name === "SITE_LOCALE");
    expect(cookie?.value).toBe("en");
    await page.reload();
    await expect(page.getByRole("link", { name: "Apartments" })).toBeVisible();

    // CTA do rezerwacji niesie prefiks języka
    await expect(page.getByRole("link", { name: "Book now" }).first()).toHaveAttribute(
      "href",
      /\/en\/o\//
    );
  });

  test("nieznana subdomena zwraca 404", async ({ page }) => {
    const res = await page.request.get("http://localhost:3100/", {
      headers: { Host: `nie-ma-takiej-${RUN}.localhost` },
    });
    expect(res.status()).toBe(404);
  });

  // Limit zgłoszeń (5/10 min) ma testy w lib/rate-limit.test.ts — poza
  // produkcją limiter celowo przepuszcza wszystko, więc e2e go nie zobaczy.
  // Formularz kontaktowy strony WWW (POST /api/sites/inquiry). Zapytanie idzie
  // mailem do właściciela, więc bez klucza Resend nie ma skutku w bazie —
  // asercje opierają się na statusach, które i tak niosą całą logikę bramki.
  const inquiry = (page: Page, data: Record<string, string>) =>
    page.request.post("http://localhost:3100/api/sites/inquiry", {
      headers: { Host: `${data.siteKey}.localhost` },
      data,
    });

  test("formularz kontaktowy przyjmuje zapytanie, honeypot ucina je przed pracą", async ({
    page,
  }) => {
    const sub = `e2e-strona-${RUN}`;

    const human = await inquiry(page, {
      siteKey: sub,
      name: `E2E Gość ${RUN}`,
      email: `inquiry-${RUN}@example.com`,
      message: "Czy jest wolny pokój w sierpniu?",
    });
    expect(human.status()).toBe(200);
    expect(await human.json()).toEqual({ ok: true });

    // Pułapka na boty: pole „website" jest ukryte, więc człowiek go nie wypełni.
    // Odpowiedź CELOWO udaje sukces — bot nie ma się dowiedzieć, że wpadł.
    // Dowodem, że nic się nie wydarzyło, jest ten sam ładunek pod nieistniejącą
    // stroną: z honeypotem 200, bez niego 404, bo dopiero wtedy trasa w ogóle
    // szuka strony i wysyła maila.
    const spam = {
      siteKey: `nie-ma-takiej-${RUN}`,
      name: "Bot",
      email: "bot@example.com",
      message: "spam spam spam",
    };
    const trapped = await inquiry(page, { ...spam, website: "https://spam.example" });
    expect(trapped.status()).toBe(200);
    expect(await trapped.json()).toEqual({ ok: true });

    expect((await inquiry(page, spam)).status()).toBe(404);
  });

  test("formularz kontaktowy odrzuca zły e-mail i pustą wiadomość", async ({ page }) => {
    const sub = `e2e-strona-${RUN}`;

    const bad = await inquiry(page, {
      siteKey: sub,
      name: "Ktoś",
      email: "to-nie-jest-email",
      message: "Wiadomość testowa",
    });
    expect(bad.status()).toBe(400);

    // wiadomość jest przycinana przed walidacją — same spacje to pustka
    const blank = await inquiry(page, {
      siteKey: sub,
      name: "Ktoś",
      email: "ktos@example.com",
      message: "          ",
    });
    expect(blank.status()).toBe(400);

    const tooShort = await inquiry(page, {
      siteKey: sub,
      name: "Ktoś",
      email: "ktos@example.com",
      message: "za krotka",
    });
    expect(tooShort.status()).toBe(400);
  });

});
