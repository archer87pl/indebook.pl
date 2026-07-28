import { expect, test } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

// Faktury, ceny i zdjecia siegaja do bazy, stad ladowanie .env
loadEnvConfig(process.cwd());

type Db = typeof import("../../lib/db");
import { PROPERTY_SLUG, RUN, futureISO, loginAsOwner, nextFridayISO } from "./helpers";

// Flow recepcji: logowanie → pulpit 1c → ręczna rezerwacja → lista/szczegóły →
// widoki Goście, Płatności i Kalendarz.
test.describe("panel recepcji", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
  });

  test("kliknięcie w menu natychmiast pokazuje loader (loading.tsx + spinner)", async ({
    page,
  }) => {
    // sztuczne opóźnienie odpowiedzi dla trasy docelowej — bez tego test byłby
    // wyścigiem z szybkim renderem i bywałby migotliwy
    await page.route(/\/admin\/raporty/, async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });

    const link = page.locator("aside").getByRole("link", { name: "Raporty" });
    await link.click();

    // 1) górny pasek postępu nawigacji (app-shell loader)
    await expect(page.locator(".navprog-run")).toBeVisible();
    // 2) szkielet ładowania z loading.tsx
    await expect(page.getByRole("status")).toBeVisible();
    // 3) spinner na ikonie klikniętej pozycji (useLinkStatus)
    await expect(link.locator(".animate-spin")).toBeVisible();
    // 4) rail pozostaje interaktywny (jest w layoucie, nie przeładowuje się)
    await expect(page.getByText("Willa RezFlow").first()).toBeVisible();

    // finalnie wchodzi treść
    await expect(page.getByText("Przychód bezpośredni")).toBeVisible();
  });

  test("pulpit pokazuje KPI, plan dnia i najbliższe rezerwacje", async ({ page }) => {
    await expect(page.getByText("Plan dnia · dziś")).toBeVisible();
    await expect(page.getByText("Najbliższe rezerwacje")).toBeVisible();
    await expect(page.getByText(/^Przychód · /)).toBeVisible();
    await expect(page.getByText("Obłożenie · 14 dni").first()).toBeVisible();
    // rail: obiekt + aktywna pozycja
    await expect(page.getByText("Willa RezFlow").first()).toBeVisible();
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

test.describe("faktury", () => {
  test.describe.configure({ mode: "serial" });

  /** Rezerwacja, z której wystawiamy fakturę. */
  async function reservationId(): Promise<number> {
    const { prisma }: Db = await import("../../lib/db");
    const r = await prisma.reservation.findFirstOrThrow({
      where: { unit: { unitType: { property: { slug: PROPERTY_SLUG } } }, status: "CONFIRMED" },
      orderBy: { id: "desc" },
      select: { id: true },
    });
    return r.id;
  }

  test("bez NIP-u sprzedawcy przycisk jest zablokowany i widać dlaczego", async ({ page }) => {
    // Regresja: wystawienie faktury bez NIP-u sprzedawcy failowało bez żadnego
    // komunikatu — teraz przycisk jest wyłączony, a powód widoczny z góry.
    const { prisma }: Db = await import("../../lib/db");
    const property = await prisma.property.findUniqueOrThrow({ where: { slug: PROPERTY_SLUG } });
    const original = property.sellerNip;
    await prisma.property.update({ where: { id: property.id }, data: { sellerNip: "" } });

    try {
      await loginAsOwner(page);
      await page.goto(`/admin/rezerwacje/${await reservationId()}`);
      await page.locator("summary", { hasText: "Wystaw fakturę VAT" }).click();

      await expect(page.getByText("NIP sprzedawcy w ustawieniach obiektu")).toBeVisible();
      await expect(page.getByRole("button", { name: "Wystaw fakturę" })).toBeDisabled();
    } finally {
      await prisma.property.update({
        where: { id: property.id },
        data: { sellerNip: original },
      });
    }
  });

  test("z NIP-em faktura wystawia się i trafia na listę", async ({ page }) => {
    const { prisma }: Db = await import("../../lib/db");
    const property = await prisma.property.findUniqueOrThrow({ where: { slug: PROPERTY_SLUG } });
    const original = property.sellerNip;
    await prisma.property.update({
      where: { id: property.id },
      data: { sellerNip: "5252344078" },
    });
    const buyer = `E2E Nabywca ${RUN}`;

    try {
      await loginAsOwner(page);
      await page.goto(`/admin/rezerwacje/${await reservationId()}`);
      await page.locator("summary", { hasText: "Wystaw fakturę VAT" }).click();

      await page.locator('input[name="buyerName"]').fill(buyer);
      await page.locator('input[name="buyerAddress"]').fill("ul. Testowa 1, 00-001 Warszawa");
      await page.getByRole("button", { name: "Wystaw fakturę" }).click();

      // akcja serwerowa konczy sie przekierowaniem — czekamy na zapis,
      // zamiast odpytywac baze natychmiast po klinieciu
      await expect
        .poll(async () => prisma.invoice.count({ where: { buyerName: buyer } }), {
          timeout: 20_000,
        })
        .toBe(1);

      const invoice = await prisma.invoice.findFirstOrThrow({
        where: { buyerName: buyer },
        orderBy: { id: "desc" },
      });
      expect(invoice.grossGr).toBeGreaterThan(0);

      await page.goto("/admin/faktury");
      await expect(page.getByText(buyer)).toBeVisible();

      await prisma.invoice.delete({ where: { id: invoice.id } });
    } finally {
      await prisma.invoice.deleteMany({ where: { buyerName: buyer } });
      await prisma.property.update({
        where: { id: property.id },
        data: { sellerNip: original },
      });
    }
  });
});

test("zdjęcie pokoju ląduje na dysku i jest serwowane pod swoim adresem", async ({ page }) => {
  // `public` jest kopiowane przy budowaniu obrazu, więc pliki dopisane później
  // serwuje dopiero trasa /uploads/* — bez niej panel pokazywałby puste ramki.
  const { prisma }: Db = await import("../../lib/db");
  await loginAsOwner(page);
  await page.goto("/admin/pokoje");

  const before = await prisma.photo.count();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );

  // na stronie jest po jednym formularzu na typ pokoju — dzialamy w obrebie
  // JEDNEGO, zeby nie wypelnic pola w innym niz klikniety przycisk
  const uploadForm = page.locator('form:has(input[type="file"][name="file"])').first();
  await uploadForm.locator('input[type="file"]').setInputFiles({
    name: `e2e-${RUN}.png`,
    mimeType: "image/png",
    buffer: png,
  });
  await uploadForm.getByRole("button", { name: "Dodaj" }).click();
  await expect.poll(async () => prisma.photo.count(), { timeout: 20_000 }).toBe(before + 1);

  const photo = await prisma.photo.findFirstOrThrow({ orderBy: { id: "desc" } });
  try {
    expect(photo.path).toMatch(/^\/uploads\//);
    const response = await page.request.get(photo.path);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    expect((await response.body()).length).toBe(png.length);
  } finally {
    await prisma.photo.delete({ where: { id: photo.id } });
  }
});

test("reguła weekendowa podnosi cenę widzianą przez gościa", async ({ page }) => {
  // Podstawowy silnik cen dotyczy każdego obiektu, a nie miał żadnego e2e.
  const { prisma }: Db = await import("../../lib/db");
  const property = await prisma.property.findUniqueOrThrow({ where: { slug: PROPERTY_SLUG } });

  // piątek w odległej przyszłości — noc weekendowa według isWeekendNight
  const friday = nextFridayISO(400);
  const saturday = new Date(`${friday}T00:00:00Z`);
  saturday.setUTCDate(saturday.getUTCDate() + 1);
  const to = saturday.toISOString().slice(0, 10);
  const url = `/o/${PROPERTY_SLUG}/wyniki?from=${friday}&to=${to}&guests=2`;

  /** Kwota pierwszej oferty w groszach, z pominięciem formatowania. */
  async function firstOfferGr(): Promise<number> {
    await page.goto(url);
    const text = await page.locator("p.tnum").first().textContent();
    return Number((text ?? "").replace(/[^\d]/g, ""));
  }

  await prisma.pricingRule.deleteMany({ where: { propertyId: property.id, kind: "WEEKEND" } });
  const base = await firstOfferGr();
  expect(base).toBeGreaterThan(0);

  try {
    await prisma.pricingRule.create({
      data: { propertyId: property.id, kind: "WEEKEND", percent: 25, param: 0, active: true },
    });

    const withRule = await firstOfferGr();
    // +25% na nocy piątkowej musi dojść do oferty widocznej dla gościa
    expect(withRule).toBeGreaterThan(base);
    expect(withRule).toBe(Math.round(base * 1.25));
  } finally {
    await prisma.pricingRule.deleteMany({ where: { propertyId: property.id, kind: "WEEKEND" } });
  }
});
