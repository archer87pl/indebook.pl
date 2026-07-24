import { expect, test } from "@playwright/test";
import { PROPERTY_SLUG, loginAsOwner } from "./helpers";

// Wielojęzyczność interfejsu gościa: prefiks w URL (PL bez, EN/DE z),
// przełącznik, auto-detekcja z Accept-Language, hreflang, oraz regresja —
// panel recepcji zostaje po polsku i bez prefiksu.
test.describe("i18n gościa", () => {
  test("PL bez prefiksu, EN z prefiksem — etykiety się tłumaczą", async ({ page }) => {
    await page.goto(`/o/${PROPERTY_SLUG}`);
    await expect(page.getByRole("heading", { name: "Nasze pokoje" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "pl");

    await page.goto(`/en/o/${PROPERTY_SLUG}`);
    await expect(page.getByRole("heading", { name: "Our rooms" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("przełącznik języka zmienia trasę na wersję DE", async ({ page }) => {
    await page.goto(`/o/${PROPERTY_SLUG}`);
    await page.getByRole("button", { name: "DE", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/de/o/${PROPERTY_SLUG}`));
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
  });

  test("auto-detekcja z Accept-Language kieruje na wersję DE", async ({ browser }) => {
    // locale kontekstu + jawny nagłówek — konfiguracja projektu wymusza pl-PL,
    // więc dla tego testu tworzymy „niemiecką" przeglądarkę od zera
    const ctx = await browser.newContext({
      locale: "de-DE",
      extraHTTPHeaders: { "Accept-Language": "de-DE,de;q=0.9" },
    });
    const page = await ctx.newPage();
    await page.goto(`/o/${PROPERTY_SLUG}`);
    await expect(page).toHaveURL(new RegExp(`/de/o/${PROPERTY_SLUG}`));
    await ctx.close();
  });

  test("strona obiektu ma hreflang na wszystkie języki", async ({ page }) => {
    await page.goto(`/o/${PROPERTY_SLUG}`);
    for (const lang of ["pl", "en", "de", "x-default"]) {
      await expect(page.locator(`link[rel="alternate"][hreflang="${lang}"]`)).toHaveCount(1);
    }
  });

  test("panel recepcji zostaje po polsku, bez prefiksu języka", async ({ page }) => {
    await loginAsOwner(page);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText("Plan dnia · dziś")).toBeVisible();
  });
});
