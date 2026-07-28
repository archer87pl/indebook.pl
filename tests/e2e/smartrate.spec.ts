import { expect, test } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { PROPERTY_SLUG, futureISO, loginAsOwner } from "./helpers";

// Ceny dynamiczne SmartRate: włączenie w panelu (stub providera) zapełnia cache
// rekomendacji, a wyłączenie go czyści i wraca do reguł. Test sięga do DB, stąd .env.
loadEnvConfig(process.cwd());

type Db = typeof import("../../lib/db");
let prisma: Db["prisma"];

test.describe("ceny dynamiczne SmartRate", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    ({ prisma } = await import("../../lib/db"));
    await prisma.property.update({
      where: { slug: PROPERTY_SLUG },
      data: { plan: "PRO", pricingMode: "BASIC", smartRateMarketId: "" },
    });
  });

  test.afterAll(async () => {
    await prisma.property.update({
      where: { slug: PROPERTY_SLUG },
      data: { pricingMode: "BASIC", smartRateMarketId: "" },
    });
  });

  test("właściciel Pro włącza SmartRate, gość dostaje cenę z silnika", async ({ page }) => {
    const from = futureISO(0);
    const to = futureISO(2);

    await loginAsOwner(page);
    await page.goto("/admin/cennik");
    await expect(page.getByText("Silnik cen")).toBeVisible();

    await page.getByLabel("Silnik").selectOption("SMARTRATE");
    await page.getByLabel("Rynek").selectOption("mkt_gdansk");
    await page.getByRole("button", { name: "Zapisz silnik" }).click();
    await expect(page.getByText("Zapisano zmiany.")).toBeVisible();

    // rekomendacje pobiera after() — poll, aż cache się zapełni
    await expect
      .poll(async () => prisma.dynamicRate.count(), { timeout: 20_000 })
      .toBeGreaterThan(0);

    // ścieżka gościa czyta z cache i nadal pokazuje ofertę
    await page.goto(`/o/${PROPERTY_SLUG}/wyniki?from=${from}&to=${to}&guests=2`);
    await expect(page.getByRole("link", { name: "Rezerwuję" }).first()).toBeVisible();
  });

  test("wyłączenie SmartRate czyści rekomendacje i wraca do reguł", async ({ page }) => {
    await loginAsOwner(page);
    await page.goto("/admin/cennik");
    await page.getByLabel("Silnik").selectOption("BASIC");
    await page.getByRole("button", { name: "Zapisz silnik" }).click();
    await expect(page.getByText("Zapisano zmiany.")).toBeVisible();

    // Poll, bo pobieranie zlecone przez after() w poprzednim teście może jeszcze
    // dopisywać doby po naszym czyszczeniu. Takie sieroty są nieszkodliwe —
    // dyspozytor czyta cache wyłącznie w trybie SMARTRATE, a ponowne włączenie
    // znowu go unieważnia — ale test musi poczekać, aż zapisy ucichną.
    await expect
      .poll(async () => prisma.dynamicRate.count(), { timeout: 20_000 })
      .toBe(0);
  });
});
