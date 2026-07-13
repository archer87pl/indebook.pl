import { expect, test } from "@playwright/test";
import { PROPERTY_SLUG, RUN, drawSignature, futureISO } from "./helpers";

// Pełna ścieżka gościa: strona obiektu → dostępność → formularz rezerwacji →
// panel gościa (oczekująca) → zaliczka (symulacja) → meldunek online z e-podpisem.
// Test tworzy prawdziwą rezerwację w bazie dev (gość "E2E ...", daleka przyszłość).
test("gość rezerwuje pobyt, płaci zaliczkę i melduje się online", async ({ page }) => {
  const from = futureISO(180);
  const to = futureISO(183);
  const guestName = `E2E Gość ${RUN}`;
  const email = `e2e-${RUN}@example.com`;

  // 1. Strona obiektu (16a): widget dostępności
  await page.goto(`/o/${PROPERTY_SLUG}`);
  await expect(page.getByRole("heading", { name: "Willa Rezio" })).toBeVisible();
  await expect(page.getByText("0% prowizji")).toBeVisible();

  await page.locator('input[name="from"]').fill(from);
  await page.locator('input[name="to"]').fill(to);
  await page.locator('input[name="guests"]').fill("2");
  await page.getByRole("button", { name: "Sprawdź dostępność" }).click();

  // 2. Wyniki: oferty z ceną i CTA
  await expect(page).toHaveURL(/\/wyniki\?/);
  const bookButtons = page.getByRole("link", { name: "Rezerwuję" });
  await expect(bookButtons.first()).toBeVisible();
  await bookButtons.first().click();

  // 3. Formularz danych gościa (16b) z podsumowaniem
  await expect(page).toHaveURL(/\/rezerwuj\/\d+/);
  await expect(page.getByText("Twoje dane")).toBeVisible();
  await expect(page.getByText("Zaliczka teraz")).toBeVisible();

  await page.locator('input[name="guestName"]').fill(guestName);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="phone"]').fill("+48 600 000 000");
  await page.locator('input[name="rodo"]').check();
  await page.getByRole("button", { name: /Zapłać .* i rezerwuj/ }).click();

  // 4. Panel gościa (18a): rezerwacja oczekuje na zaliczkę
  await expect(page).toHaveURL(/\/r\/HO-/);
  await expect(page.getByRole("heading", { name: "Dokończ rezerwację" })).toBeVisible();
  await expect(page.getByText("Oczekuje na zaliczkę")).toBeVisible();
  await expect(page.getByText(guestName)).toBeVisible();

  // 5. Zaliczka — tryb symulacji (bez P24) potwierdza od razu
  await page.getByRole("button", { name: /Opłać zaliczkę/ }).click();
  await expect(
    page.getByRole("heading", { name: "Rezerwacja potwierdzona!" }),
  ).toBeVisible();
  await expect(page.getByText("Opłacona", { exact: true })).toBeVisible();

  // 6. Meldunek online (8a): karta + e-podpis
  await page.getByRole("link", { name: "Zamelduj się" }).click();
  await expect(page).toHaveURL(/\/meldunek$/);
  await expect(page.getByRole("heading", { name: "Meldunek online" })).toBeVisible();

  await page.locator('input[name="address"]').fill("ul. Testowa 1, 00-001 Warszawa");
  await drawSignature(page);
  await page.locator('input[name="terms"]').check();
  await page.locator('input[name="rodo"]').check();
  await page.getByRole("button", { name: /Potwierdź i podpisz/ }).click();

  // 7. Powrót do panelu gościa z potwierdzeniem meldunku
  await expect(page).toHaveURL(/\/r\/HO-.*checkedin=1/);
  await expect(
    page.getByText("Karta meldunkowa wypełniona. Dziękujemy — do zobaczenia!"),
  ).toBeVisible();
  await expect(
    page.getByText("Zameldowany online — karta meldunkowa wypełniona."),
  ).toBeVisible();
});

test("nieprawidłowy zakres dat pokazuje błąd zamiast ofert", async ({ page }) => {
  await page.goto(`/o/${PROPERTY_SLUG}/wyniki?from=2020-01-05&to=2020-01-01`);
  await expect(page.getByText("Nieprawidłowy zakres dat")).toBeVisible();
});
