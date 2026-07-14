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

// Formularze: przycisk wysyłki pokazuje spinner i blokuje się na czas
// server action (useFormStatus) — chroni też przed podwójnym wysłaniem.
test("przycisk formularza pokazuje stan wysyłki i blokuje się", async ({ page }) => {
  await page.goto("/login");
  // opóźnienie server action, żeby stan pending był obserwowalny
  await page.route(/\/login/, async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((r) => setTimeout(r, 1500));
    }
    await route.continue();
  });

  await page.getByLabel("E-mail").fill(DEMO.email);
  await page.getByLabel(/^Hasło/).fill(DEMO.password);
  const submit = page.getByRole("button", { name: "Zaloguj się" });
  await submit.click();

  await expect(submit).toBeDisabled();
  await expect(submit).toHaveAttribute("aria-busy", "true");
  await expect(submit.locator(".animate-spin")).toBeVisible();

  await expect(page).toHaveURL(/\/admin$/);
});
