import { expect, test } from "@playwright/test";
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

  test("nieznana subdomena zwraca 404", async ({ page }) => {
    const res = await page.request.get("http://localhost:3100/", {
      headers: { Host: `nie-ma-takiej-${RUN}.localhost` },
    });
    expect(res.status()).toBe(404);
  });
});
