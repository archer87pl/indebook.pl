import { expect, test } from "@playwright/test";

// Blog landingu (pliki .md): nawigacja, indeks, artykuł z treścią Markdown.
test("blog: nawigacja z landingu, indeks i artykuł renderują się", async ({
  page,
}) => {
  // wejście z nawigacji
  await page.goto("/");
  await page.getByRole("navigation").getByRole("link", { name: "Blog" }).click();
  await expect(page).toHaveURL(/\/blog$/);
  await expect(
    page.getByRole("heading", { name: "Wiedza, która pomaga sprzedawać bezpośrednio" }),
  ).toBeVisible();

  // wyróżniony artykuł prowadzi do treści
  await page.getByRole("link", { name: /prowizje portali OTA/ }).first().click();
  await expect(page).toHaveURL(/\/blog\/rezerwacje-bez-prowizji$/);
  await expect(
    page.getByRole("heading", {
      name: "Ile naprawdę kosztują Cię prowizje portali OTA",
      level: 1,
    }),
  ).toBeVisible();

  // treść z Markdown: nagłówek sekcji, tabela, CTA
  await expect(page.getByRole("heading", { name: "Rachunek jest prosty" })).toBeVisible();
  await expect(page.locator(".prose table")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Chcesz rezerwacji bez prowizji?" }),
  ).toBeVisible();

  // powrót do listy
  await page.getByRole("link", { name: "Wszystkie artykuły" }).first().click();
  await expect(page).toHaveURL(/\/blog$/);
});

test("blog: sekcja poradnika widoczna na landingu", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Z poradnika Rezio" })).toBeVisible();
});
