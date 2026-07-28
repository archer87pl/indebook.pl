import { expect, test } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

// Rejestracja i reset hasla siegaja do bazy, stad ladowanie .env
loadEnvConfig(process.cwd());

type Db = typeof import("../../lib/db");
import { DEMO, RUN } from "./helpers";

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

test.describe("rejestracja i odzyskiwanie hasła", () => {
  test.describe.configure({ mode: "serial" });

  const email = `e2e-owner-${RUN}@example.com`;
  const password = "e2ehaslo123";

  test("nowy właściciel rejestruje obiekt i trafia do panelu z onboardingiem", async ({
    page,
  }) => {
    // Ścieżka wejścia każdego nowego klienta — bez niej nikt nie założy konta.
    await page.goto("/rejestracja");
    await page.locator('input[name="name"]').fill(`E2E Właściciel ${RUN}`);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('input[name="propertyName"]').fill(`Willa E2E ${RUN}`);
    await page.getByRole("button", { name: "Załóż konto i obiekt" }).click();

    // rejestracja od razu loguje i prowadzi do panelu
    await expect(page).toHaveURL(/\/admin$/);
    // świeży obiekt nie ma pokoi, więc panel zachęca do pierwszego kroku
    await expect(page.getByRole("link", { name: /Dodaj pierwszy typ pokoju/ })).toBeVisible();
  });

  test("ten sam e-mail nie pozwala założyć drugiego konta", async ({ page }) => {
    await page.goto("/rejestracja");
    await page.locator('input[name="name"]').fill("Ktoś inny");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill("innehaslo123");
    await page.locator('input[name="propertyName"]').fill("Inny obiekt");
    await page.getByRole("button", { name: "Załóż konto i obiekt" }).click();

    await expect(page.locator(".alert-error")).toBeVisible();
    await expect(page).toHaveURL(/rejestracja/);
  });

  test("reset hasła: token z bazy pozwala ustawić nowe hasło", async ({ page }) => {
    // Maila nie przeczytamy, więc token bierzemy prosto z bazy — sprawdzamy
    // to, co robi link z wiadomości.
    const { prisma }: Db = await import("../../lib/db");
    const newPassword = "noweHaslo456";

    await page.goto("/zapomniane-haslo");
    await page.locator('input[name="email"]').fill(email);
    await page.getByRole("button", { name: "Wyślij link do resetu" }).click();

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await expect
      .poll(() => prisma.passwordResetToken.count({ where: { userId: user.id } }), {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);

    const reset = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: user.id },
      orderBy: { expiresAt: "desc" },
    });

    await page.goto(`/reset-hasla/${reset.token}`);
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await page.locator('input[name="password"]').fill(newPassword);
    await page.getByRole("button", { name: "Ustaw hasło i wyloguj wszystkie sesje" }).click();

    // hasło musi faktycznie się zmienić w bazie, zanim sprawdzimy logowanie
    await expect
      .poll(
        async () =>
          (await prisma.user.findUniqueOrThrow({ where: { email } })).passwordHash,
        { timeout: 15_000 }
      )
      .not.toBe(user.passwordHash);

    // nowe hasło wpuszcza do panelu
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel(/^Hasło/).fill(newPassword);
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test.afterAll(async () => {
    // sprzatamy konto testowe razem z obiektem
    const { prisma }: Db = await import("../../lib/db");
    const user = await prisma.user.findUnique({
      where: { email },
      include: { property: { include: { unitTypes: true } } },
    });
    if (!user) return;
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    if (user.property) {
      await prisma.unitType.deleteMany({ where: { propertyId: user.property.id } });
      await prisma.property.delete({ where: { id: user.property.id } });
    }
    await prisma.user.delete({ where: { id: user.id } });
  });
});
