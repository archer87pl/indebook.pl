import { expect, test } from "@playwright/test";

const ADMIN = { email: "admin@rezio.pl", password: "admin1234" };

// Panel platformy: pulpit z trendem i zdrowiem, globalne rezerwacje i opinie,
// karta obiektu z impersonacją na konto właściciela.
test("superadmin przegląda platformę i loguje się jako właściciel", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(ADMIN.email);
  await page.getByLabel(/^Hasło/).fill(ADMIN.password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();

  // pulpit platformy
  await expect(page).toHaveURL(/\/superadmin$/);
  await expect(page.getByText("MRR (wg planów)")).toBeVisible();
  await expect(page.getByText("Wzrost · ostatnie 6 miesięcy")).toBeVisible();
  await expect(page.getByText("Zdrowie platformy")).toBeVisible();

  // wyszukiwarka obiektów
  await page.goto("/superadmin?q=willa");
  await expect(page.getByText("/o/willa-rezio")).toBeVisible();
  await expect(page.getByText("apartamenty-marina-sopot")).toHaveCount(0);

  // globalne rezerwacje
  await page.getByRole("link", { name: "Rezerwacje" }).first().click();
  await expect(page).toHaveURL(/\/superadmin\/rezerwacje/);
  await expect(page.getByText("Rezerwacje platformy")).toBeVisible();
  await expect(page.getByText(/HO-/).first()).toBeVisible();

  // globalne opinie z moderacją
  await page.getByRole("link", { name: "Opinie" }).first().click();
  await expect(page).toHaveURL(/\/superadmin\/opinie/);
  await expect(page.getByText("Opinie platformy")).toBeVisible();

  // konfiguracja bramek/integracji
  await page.getByRole("link", { name: "Ustawienia" }).first().click();
  await expect(page).toHaveURL(/\/superadmin\/ustawienia/);
  await expect(page.getByText("Bramka płatności — Przelewy24")).toBeVisible();
  await expect(page.getByText("E-maile — Resend")).toBeVisible();
  await expect(page.getByText("SMS-y — SMSAPI")).toBeVisible();

  // dziennik zdarzeń (nieudane logowania z testów auth powinny tu trafiać)
  await page.getByRole("link", { name: "Logi" }).first().click();
  await expect(page).toHaveURL(/\/superadmin\/logi/);
  await expect(page.getByText("Dziennik zdarzeń")).toBeVisible();
  await expect(page.getByRole("link", { name: "Akcje admina" })).toBeVisible();

  // karta obiektu → impersonacja właściciela
  await page.goto("/superadmin?q=willa");
  await page.getByRole("link", { name: "Zarządzaj →" }).first().click();
  await expect(page).toHaveURL(/\/superadmin\/obiekt\/\d+$/);
  await expect(page.getByText("Ostatnie rezerwacje")).toBeVisible();

  await page.getByRole("button", { name: "Zaloguj jako właściciel" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText("Plan dnia · dziś")).toBeVisible();
  await expect(page.getByText("Willa Rezio").first()).toBeVisible();
});
