import { expect, test } from "@playwright/test";
import { DEMO } from "./helpers";

// Logowanie (12a): split-layout, błędne dane, poprawne dane, wylogowanie.
test("błędne hasło pokazuje komunikat, poprawne wpuszcza do panelu", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Zaloguj się" })).toBeVisible();
  // lewa kolumna brandowa (12a)
  await expect(page.getByText("Twoja recepcja")).toBeVisible();

  await page.getByLabel("E-mail").fill(DEMO.email);
  await page.getByLabel(/^Hasło/).fill("zle-haslo-123");
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByText("Nieprawidłowy e-mail lub hasło.")).toBeVisible();

  await page.getByLabel("E-mail").fill(DEMO.email);
  await page.getByLabel(/^Hasło/).fill(DEMO.password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText("Plan dnia · dziś")).toBeVisible();
});

test("panel wymaga zalogowania", async ({ page }) => {
  await page.goto("/admin/rezerwacje");
  await expect(page).toHaveURL(/\/login/);
});
