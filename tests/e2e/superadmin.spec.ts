import { expect, test } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { PROPERTY_SLUG, RUN, futureISO, loginAsOwner, pastISO } from "./helpers";

// Akcje platformy zmieniaja stan obiektu, wiec sprawdzamy je w bazie
loadEnvConfig(process.cwd());

type Db = typeof import("../../lib/db");

const ADMIN = { email: "admin@rezflow.pl", password: "admin1234" };

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
  await expect(page.getByText("/o/willa-rezflow")).toBeVisible();
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

  // konfiguracja integracji (płatności P24 konfiguruje obiekt u siebie)
  await page.getByRole("link", { name: "Ustawienia" }).first().click();
  await expect(page).toHaveURL(/\/superadmin\/ustawienia/);
  await expect(page.getByText("E-maile — Resend")).toBeVisible();
  await expect(page.getByText("SMS-y — SMSAPI")).toBeVisible();
  await expect(page.getByText("Bramka płatności — Przelewy24")).toHaveCount(0);

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
  await expect(page.getByText("Willa RezFlow").first()).toBeVisible();
});

test.describe("akcje platformy", () => {
  test.describe.configure({ mode: "serial" });

  async function loginAsAdmin(page: import("@playwright/test").Page) {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(ADMIN.email);
    await page.getByLabel(/^Hasło/).fill(ADMIN.password);
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await expect(page).toHaveURL(/\/superadmin$/);
  }

  test("usunięcie obiektu wymaga wpisania slugu i zabiera cały graf danych", async ({
    page,
  }) => {
    // Operacja nieodwracalna, więc obiekt jest jednorazowy — nigdy nie tykamy
    // obiektu demo, na którym stoi reszta zestawu.
    const { prisma }: Db = await import("../../lib/db");
    const slug = `e2e-do-kasacji-${RUN}`;
    const property = await prisma.property.create({
      data: {
        slug,
        name: `E2E Do kasacji ${RUN}`,
        owner: {
          create: {
            email: `kasacja-${RUN}@example.com`,
            name: `E2E Właściciel ${RUN}`,
            passwordHash: "x", // konto nigdy się nie loguje
          },
        },
        unitTypes: {
          create: {
            name: "Pokój",
            maxGuests: 2,
            basePriceGr: 20000,
            units: { create: { name: "1" } },
          },
        },
      },
      include: { unitTypes: { include: { units: true } } },
    });
    const unitId = property.unitTypes[0].units[0].id;
    const code = `HO-E2E-DEL-${RUN}`.toUpperCase().slice(0, 20);
    await prisma.reservation.create({
      data: {
        code,
        unitId,
        guestName: `E2E Gość ${RUN}`,
        email: `gosc-kasacja-${RUN}@example.com`,
        guests: 2,
        checkIn: futureISO(800),
        checkOut: futureISO(802),
        totalGr: 40000,
        depositGr: 12000,
        status: "CONFIRMED",
      },
    });

    const stillThere = () => prisma.property.count({ where: { id: property.id } });

    try {
      await loginAsAdmin(page);
      await page.goto(`/superadmin/obiekt/${property.id}`);

      // zły slug — bramka nie przepuszcza, obiekt zostaje
      await page.locator('input[name="confirmSlug"]').fill(`${slug}-nie-ten`);
      await page.getByRole("button", { name: "Usuń obiekt trwale" }).click();
      await expect(page.getByText("wpisz dokładnie jego adres")).toBeVisible();
      expect(await stillThere()).toBe(1);

      // pusty slug też nie wystarcza
      await page.getByRole("button", { name: "Usuń obiekt trwale" }).click();
      await expect(page.getByText("wpisz dokładnie jego adres")).toBeVisible();
      expect(await stillThere()).toBe(1);

      // dokładny slug — kasacja razem z rezerwacjami, jednostkami i kontem
      await page.locator('input[name="confirmSlug"]').fill(slug);
      await page.getByRole("button", { name: "Usuń obiekt trwale" }).click();

      await expect.poll(stillThere, { timeout: 20_000 }).toBe(0);
      expect(await prisma.reservation.count({ where: { code } })).toBe(0);
      expect(await prisma.unit.count({ where: { id: unitId } })).toBe(0);
      expect(await prisma.unitType.count({ where: { propertyId: property.id } })).toBe(0);
      expect(await prisma.user.count({ where: { id: property.ownerId } })).toBe(0);
    } finally {
      // gdyby test padł przed kasacją — sprzątamy po sobie
      if (await stillThere()) {
        await prisma.reservation.deleteMany({ where: { code } });
        await prisma.unit.deleteMany({ where: { unitType: { propertyId: property.id } } });
        await prisma.unitType.deleteMany({ where: { propertyId: property.id } });
        await prisma.property.delete({ where: { id: property.id } });
        await prisma.user.delete({ where: { id: property.ownerId } });
      }
    }
  });

  test("zwykły właściciel nie wchodzi do panelu platformy", async ({ page }) => {
    // Granica uprawnień: konto obiektu nie może zobaczyć danych całej platformy.
    await loginAsOwner(page);

    for (const path of ["/superadmin", "/superadmin/rezerwacje", "/superadmin/ustawienia"]) {
      await page.goto(path);
      await expect(page).not.toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByText("MRR (wg planów)")).toHaveCount(0);
    }
  });

  test("zawieszenie obiektu odcina rezerwacje, przywrócenie je oddaje", async ({ page }) => {
    const { prisma }: Db = await import("../../lib/db");
    const property = await prisma.property.findUniqueOrThrow({ where: { slug: PROPERTY_SLUG } });

    try {
      await loginAsAdmin(page);
      await page.goto(`/superadmin/obiekt/${property.id}`);
      await page.getByRole("button", { name: "Zawieś obiekt" }).click();

      await expect
        .poll(
          async () =>
            (await prisma.property.findUniqueOrThrow({ where: { id: property.id } })).suspended,
          { timeout: 15_000 }
        )
        .toBe(true);

      // gość widzi komunikat zamiast oferty
      await page.goto(`/o/${PROPERTY_SLUG}/wyniki?from=${futureISO(800)}&to=${futureISO(802)}&guests=2`);
      await expect(page.getByRole("link", { name: "Rezerwuję" })).toHaveCount(0);

      await page.goto(`/superadmin/obiekt/${property.id}`);
      await page.getByRole("button", { name: "Przywróć obiekt" }).click();
      await expect
        .poll(
          async () =>
            (await prisma.property.findUniqueOrThrow({ where: { id: property.id } })).suspended,
          { timeout: 15_000 }
        )
        .toBe(false);
    } finally {
      await prisma.property.update({
        where: { id: property.id },
        data: { suspended: false },
      });
    }
  });

  test("ukrycie opinii zdejmuje ją ze strony obiektu", async ({ page }) => {
    const { prisma }: Db = await import("../../lib/db");
    const property = await prisma.property.findUniqueOrThrow({ where: { slug: PROPERTY_SLUG } });
    const comment = `Opinia do moderacji ${RUN}`;

    // opinia jest przypieta do rezerwacji (relacja 1:1), wiec najpierw ona
    const unit = await prisma.unit.findFirstOrThrow({
      where: { unitType: { propertyId: property.id } },
      orderBy: { id: "asc" },
    });
    const code = `HO-E2E-MOD-${RUN}`.toUpperCase().slice(0, 20);
    const reservation = await prisma.reservation.create({
      data: {
        code,
        unitId: unit.id,
        guestName: `E2E Recenzent ${RUN}`,
        email: `mod-${RUN}@example.com`,
        guests: 2,
        checkIn: pastISO(20),
        checkOut: pastISO(18),
        totalGr: 30000,
        depositGr: 9000,
        status: "CONFIRMED",
      },
    });
    const review = await prisma.review.create({
      data: {
        reservationId: reservation.id,
        propertyId: property.id,
        authorName: `E2E R. ${RUN}`,
        rating: 5,
        comment,
      },
    });

    try {
      // najpierw jest publiczna
      await expect
        .poll(
          async () => {
            await page.goto(`/o/${PROPERTY_SLUG}`);
            return page.getByText(comment).first().isVisible().catch(() => false);
          },
          { timeout: 30_000 }
        )
        .toBe(true);

      await loginAsAdmin(page);
      await page.goto("/superadmin/opinie");
      const row = page.locator("div", { hasText: comment }).last();
      await row.getByRole("button", { name: "Ukryj" }).click();

      await expect
        .poll(
          async () => (await prisma.review.findUniqueOrThrow({ where: { id: review.id } })).hidden,
          { timeout: 15_000 }
        )
        .toBe(true);

      // i znika gościom
      await expect
        .poll(
          async () => {
            await page.goto(`/o/${PROPERTY_SLUG}`);
            return page.getByText(comment).first().isVisible().catch(() => false);
          },
          { timeout: 30_000 }
        )
        .toBe(false);
    } finally {
      await prisma.review.deleteMany({ where: { id: review.id } });
      await prisma.reservation.deleteMany({ where: { code } });
    }
  });

  test("zmiana planu obiektu odblokowuje funkcje w panelu właściciela", async ({ page }) => {
    const { prisma }: Db = await import("../../lib/db");
    const property = await prisma.property.findUniqueOrThrow({ where: { slug: PROPERTY_SLUG } });
    const original = property.plan;

    try {
      await prisma.property.update({ where: { id: property.id }, data: { plan: "FREE" } });

      await loginAsOwner(page);
      await page.goto("/admin/cennik");
      // plan FREE nie ma cen dynamicznych — zamiast przełącznika jest zachęta
      await expect(page.getByRole("link", { name: /Zobacz plany od Pro/ })).toBeVisible();

      await loginAsAdmin(page);
      await page.goto("/superadmin?q=willa");
      const card = page.locator("form", { has: page.locator('select[name="plan"]') }).first();
      await card.locator('select[name="plan"]').selectOption("PRO");
      await card.getByRole("button", { name: "Zmień" }).click();

      await expect
        .poll(
          async () =>
            (await prisma.property.findUniqueOrThrow({ where: { id: property.id } })).plan,
          { timeout: 15_000 }
        )
        .toBe("PRO");

      await loginAsOwner(page);
      await page.goto("/admin/cennik");
      await expect(page.getByRole("link", { name: /Zobacz plany od Pro/ })).toHaveCount(0);
      await expect(page.getByText("Silnik cen")).toBeVisible();
    } finally {
      await prisma.property.update({ where: { id: property.id }, data: { plan: original } });
    }
  });
});
