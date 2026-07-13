import { expect, test } from "@playwright/test";
import { RUN, futureISO, loginAsOwner } from "./helpers";

// Flow recepcji: logowanie → pulpit 1c → ręczna rezerwacja → lista/szczegóły →
// widoki Goście, Płatności i Kalendarz.
test.describe("panel recepcji", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
  });

  test("pulpit pokazuje KPI, plan dnia i najbliższe rezerwacje", async ({ page }) => {
    await expect(page.getByText("Plan dnia · dziś")).toBeVisible();
    await expect(page.getByText("Najbliższe rezerwacje")).toBeVisible();
    await expect(page.getByText(/^Przychód · /)).toBeVisible();
    await expect(page.getByText("Obłożenie · 14 dni").first()).toBeVisible();
    // rail: obiekt + aktywna pozycja
    await expect(page.getByText("Willa Rezio").first()).toBeVisible();
  });

  test("recepcja tworzy ręczną rezerwację i widzi ją na liście oraz w szczegółach", async ({
    page,
  }) => {
    const guestName = `E2E Recepcja ${RUN}`;

    await page.goto("/admin/rezerwacje/nowa");
    await expect(page.getByText("Nowa rezerwacja").first()).toBeVisible();
    await expect(page.getByText("Cennik bazowy")).toBeVisible();

    await page.locator('input[name="from"]').fill(futureISO(200));
    await page.locator('input[name="to"]').fill(futureISO(202));
    await page.locator('input[name="guestName"]').fill(guestName);
    await page.getByRole("button", { name: /Utwórz rezerwację/ }).click();

    // lista 2b: nowa rezerwacja widoczna jako potwierdzona
    await expect(page).toHaveURL(/\/admin\/rezerwacje$/);
    const row = page.getByRole("row", { name: new RegExp(guestName) });
    await expect(row).toBeVisible();
    await expect(row.getByText("Potwierdzona")).toBeVisible();

    // szczegóły 2c: stepper + płatność + edycja
    await row.getByRole("link", { name: "Szczegóły" }).click();
    await expect(page).toHaveURL(/\/admin\/rezerwacje\/\d+$/);
    await expect(page.getByRole("heading", { name: guestName })).toBeVisible();
    await expect(page.getByText("Meldunek online").first()).toBeVisible();
    await expect(page.getByText("Płatność", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Edycja rezerwacji")).toBeVisible();

    // wyszukiwarka listy (2b, param q)
    await page.goto(`/admin/rezerwacje?q=${encodeURIComponent(guestName)}`);
    await expect(page.getByRole("row", { name: new RegExp(guestName) })).toBeVisible();
  });

  test("Goście (10b) agregują rezerwacje, Płatności (10a) pokazują rejestr", async ({
    page,
  }) => {
    await page.goto("/admin/goscie");
    await expect(page.getByText("Wszyscy goście")).toBeVisible();
    await expect(page.getByText("Powracający").first()).toBeVisible();
    await expect(page.getByText("Baza gości")).toBeVisible();

    await page.goto("/admin/platnosci");
    await expect(page.getByText(/^Przychód · /)).toBeVisible();
    await expect(page.getByText("Oczekuje na płatność")).toBeVisible();
    await expect(page.getByText("Transakcje").first()).toBeVisible();
  });

  test("kalendarz obłożenia (2d) renderuje siatkę i podsumowanie okna", async ({
    page,
  }) => {
    await page.goto("/admin/kalendarz");
    await expect(page.getByText("Jednostka", { exact: true })).toBeVisible();
    await expect(page.getByText("Obłożenie w oknie")).toBeVisible();
    await expect(page.getByText("Wolne jednostko-noce")).toBeVisible();
    await expect(page.getByText("bezpośrednia")).toBeVisible(); // legenda
  });
});
