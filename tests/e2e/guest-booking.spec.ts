import { expect, test } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { PROPERTY_SLUG, RUN, drawSignature, futureISO, loginAsOwner, pastISO } from "./helpers";

// Część testów zakłada dane w bazie (kod promocyjny, zakończony pobyt), stąd .env
loadEnvConfig(process.cwd());

type Db = typeof import("../../lib/db");

/** Rezerwuje pobyt przez UI i zwraca kod rezerwacji z adresu panelu gościa. */
async function bookStay(
  page: import("@playwright/test").Page,
  from: string,
  to: string,
  opts: { promo?: string } = {}
): Promise<string> {
  await page.goto(`/o/${PROPERTY_SLUG}/wyniki?from=${from}&to=${to}&guests=2`);
  await page.getByRole("link", { name: "Rezerwuję" }).first().click();

  await page.locator('input[name="guestName"]').fill(`E2E Gość ${RUN}`);
  await page.locator('input[name="email"]').fill(`e2e-${RUN}@example.com`);
  await page.locator('input[name="rodo"]').check();
  if (opts.promo) await page.locator('input[name="promo"]').fill(opts.promo);
  await page.getByRole("button", { name: /Zapłać .* i rezerwuj/ }).click();

  await expect(page).toHaveURL(/\/r\/HO-/);
  return page.url().match(/\/r\/(HO-[A-Z0-9-]+)/)![1];
}

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
  await expect(page.getByRole("heading", { name: "Willa RezFlow" })).toBeVisible();
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

test("gość zmienia termin, a cena zostaje przeliczona", async ({ page }) => {
  const { prisma }: Db = await import("../../lib/db");
  const from = futureISO(300);
  const to = futureISO(302); // 2 noce
  const newFrom = futureISO(310);
  const newTo = futureISO(314); // 4 noce — dłużej, więc drożej

  const code = await bookStay(page, from, to);
  const before = await prisma.reservation.findUniqueOrThrow({ where: { code } });

  // formularz siedzi w zwiniętym <details> — najpierw je otwieramy
  await page.locator("summary", { hasText: "Zmień termin pobytu" }).click();
  await page.locator('input[name="from"]').fill(newFrom);
  await page.locator('input[name="to"]').fill(newTo);
  await page.getByRole("button", { name: "Przelicz i zmień termin" }).click();

  await expect(
    page.getByText("Termin pobytu został zmieniony. Potwierdzenie wysłaliśmy e-mailem.")
  ).toBeVisible();

  // asercja na kwocie w bazie, nie na napisie — etykiety są tłumaczone
  const after = await prisma.reservation.findUniqueOrThrow({ where: { code } });
  expect(after.checkIn).toBe(newFrom);
  expect(after.checkOut).toBe(newTo);
  expect(after.totalGr).toBeGreaterThan(before.totalGr);
  expect(after.depositGr).toBeGreaterThan(before.depositGr);
});

test("gość anuluje rezerwację i termin wraca do puli", async ({ page }) => {
  const { prisma }: Db = await import("../../lib/db");
  const from = futureISO(400);
  const to = futureISO(402);

  const code = await bookStay(page, from, to);

  page.once("dialog", (d) => d.accept()); // potwierdzenie anulowania
  await page.getByRole("button", { name: "Anuluj rezerwację" }).click();
  await expect(page.getByText("Rezerwacja anulowana")).toBeVisible();

  const reservation = await prisma.reservation.findUniqueOrThrow({ where: { code } });
  expect(reservation.status).toBe("CANCELLED");

  // te same daty muszą znów dawać ofertę
  await page.goto(`/o/${PROPERTY_SLUG}/wyniki?from=${from}&to=${to}&guests=2`);
  await expect(page.getByRole("link", { name: "Rezerwuję" }).first()).toBeVisible();
});

test("kod promocyjny obniża kwotę do zapłaty", async ({ page }) => {
  const { prisma }: Db = await import("../../lib/db");
  const property = await prisma.property.findUniqueOrThrow({ where: { slug: PROPERTY_SLUG } });
  const code = `E2E${RUN}`.toUpperCase().slice(0, 12);

  await prisma.promoCode.create({
    data: { propertyId: property.id, code, percentOff: 20, active: true },
  });

  try {
    const from = futureISO(500);
    const to = futureISO(502);

    // ten sam termin rezerwujemy dwa razy (obiekt ma kilka jednostek):
    // raz bez kodu, raz z kodem — porównanie jest wtedy uczciwe
    const plain = await bookStay(page, from, to);
    const discounted = await bookStay(page, from, to, { promo: code });

    const full = await prisma.reservation.findUniqueOrThrow({ where: { code: plain } });
    const promo = await prisma.reservation.findUniqueOrThrow({ where: { code: discounted } });

    expect(promo.promoCode).toBe(code);
    expect(promo.discountGr).toBe(Math.round(full.totalGr * 0.2));
    expect(promo.totalGr).toBe(full.totalGr - promo.discountGr);
  } finally {
    await prisma.promoCode.deleteMany({ where: { propertyId: property.id, code } });
  }
});

test("opinia po pobycie trafia na stronę obiektu", async ({ page }) => {
  // Opinia wymaga ZAKOŃCZONEGO pobytu, więc rezerwację z przeszłości tworzymy
  // w bazie — przez UI nie da się zarezerwować wstecz.
  const { prisma }: Db = await import("../../lib/db");
  const property = await prisma.property.findUniqueOrThrow({ where: { slug: PROPERTY_SLUG } });
  const unit = await prisma.unit.findFirstOrThrow({
    where: { unitType: { propertyId: property.id } },
    orderBy: { id: "asc" },
  });
  const code = `HO-E2E-REV-${RUN}`.toUpperCase().slice(0, 20);
  const comment = `Swietny pobyt ${RUN}`;

  await prisma.reservation.create({
    data: {
      code,
      unitId: unit.id,
      guestName: `E2E Recenzent ${RUN}`,
      email: `rev-${RUN}@example.com`,
      guests: 2,
      checkIn: pastISO(10),
      checkOut: pastISO(8),
      totalGr: 50000,
      depositGr: 15000,
      status: "CONFIRMED",
    },
  });

  try {
    await page.goto(`/r/${code}/opinia`);
    await expect(page.getByRole("heading", { name: "Jak minął pobyt?" })).toBeVisible();

    await page.getByRole("button", { name: "5 z 5" }).click();
    await page.locator('textarea[name="comment"]').fill(comment);
    await page.locator('input[name="consent"]').check();
    await page.getByRole("button", { name: "Wyślij opinię" }).click();

    // po wyslaniu wracamy do panelu goscia z potwierdzeniem
    await expect(page.getByText("Dziękujemy za opinię o pobycie!")).toBeVisible();

    const review = await prisma.review.findFirstOrThrow({ where: { comment } });
    expect(review.rating).toBe(5);

    // opinia jest publiczna — musi pojawic sie na stronie obiektu
    await expect
      .poll(
        async () => {
          await page.goto(`/o/${PROPERTY_SLUG}`);
          return page.getByText(comment).first().isVisible().catch(() => false);
        },
        { timeout: 30_000 }
      )
      .toBe(true);

    await prisma.review.delete({ where: { id: review.id } });
  } finally {
    await prisma.review.deleteMany({ where: { comment } });
    await prisma.reservation.deleteMany({ where: { code } });
  }
});

test("wiadomość gościa dociera do panelu recepcji", async ({ page }) => {
  const { prisma }: Db = await import("../../lib/db");
  const message = `Pytanie E2E ${RUN}`;
  const code = await bookStay(page, futureISO(600), futureISO(602));

  await page.locator('textarea[name="body"]').fill(message);
  await page.getByRole("button", { name: "Wyślij wiadomość" }).click();
  await expect(page.getByText(message)).toBeVisible();

  const reservation = await prisma.reservation.findUniqueOrThrow({ where: { code } });
  await loginAsOwner(page);
  await page.goto(`/admin/rezerwacje/${reservation.id}`);
  await expect(page.getByText(message)).toBeVisible();
});
