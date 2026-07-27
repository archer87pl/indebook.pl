import { expect, test } from "@playwright/test";
import { PROPERTY_SLUG, futureISO, loginAsOwner } from "./helpers";

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

  test("błąd akcji wraca w języku gościa, nie po polsku", async ({ page }) => {
    // zakres dat z przeszłości — akcja odbija rezerwację; komunikat musi być
    // w języku strony, bo wcześniej server action wstawiał polskie zdanie do URL-a
    // strona rezerwacji odrzuca daty z przeszłości zanim cokolwiek wyrenderuje,
    // więc zakres musi być poprawny — sprawdzamy sam render komunikatu
    const range = `from=${futureISO(0)}&to=${futureISO(2)}&guests=2`;
    const unitTypeId = 1;

    // polski PRZED wizytami na /en i /de — next-intl zapamiętuje wybór języka
    // w cookie, więc po nich wejście bez prefiksu przekierowałoby na EN
    await page.goto(`/rezerwuj/${unitTypeId}?${range}&error=pastArrival`);
    await expect(
      page.getByText("Data przyjazdu nie może być w przeszłości.")
    ).toBeVisible();

    await page.goto(`/de/rezerwuj/${unitTypeId}?${range}&error=pastArrival`);
    await expect(
      page.getByText("Das Anreisedatum darf nicht in der Vergangenheit liegen.")
    ).toBeVisible();

    await page.goto(`/en/rezerwuj/${unitTypeId}?${range}&error=pastArrival`);
    await expect(page.getByText("The arrival date cannot be in the past.")).toBeVisible();
  });

  test("komunikat z liczbą wstawia ją w zdanie", async ({ page }) => {
    await page.goto(
      `/en/rezerwuj/1?from=${futureISO(0)}&to=${futureISO(2)}&guests=2&error=maxGuests&n=4`
    );
    await expect(page.getByText("This room type sleeps up to 4 guests.")).toBeVisible();
  });

  test("nieznany kod błędu degraduje do komunikatu ogólnego", async ({ page }) => {
    // parametr pochodzi z URL-a, więc nie wolno renderować go dosłownie
    await page.goto(
      `/en/rezerwuj/1?from=${futureISO(0)}&to=${futureISO(2)}&guests=2&error=<script>`
    );
    await expect(page.getByText("Something went wrong. Please try again.")).toBeVisible();
  });

  test("kwoty i daty mają zapis języka gościa", async ({ page }) => {
    // najpierw polski — potem cookie next-intl zapamiętuje wybór
    await page.goto(`/o/${PROPERTY_SLUG}`);
    const pl = await page.locator("body").innerText();

    await page.goto(`/de/o/${PROPERTY_SLUG}`);
    const de = await page.locator("body").innerText();

    // ta sama waluta, inny zapis: polski ma symbol „zł", niemiecki kod „PLN".
    // Uwaga: polska notacja wstawia twardą spację (U+00A0), więc nie zakładamy
    // tu kształtu odstępu — sprawdzamy sam symbol i to, że zapisy się różnią.
    expect(pl).toContain("zł");
    expect(de).toContain("PLN");
    expect(de).not.toBe(pl);
  });

  test("panel recepcji zostaje po polsku, bez prefiksu języka", async ({ page }) => {
    await loginAsOwner(page);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText("Plan dnia · dziś")).toBeVisible();
  });
});
