import { expect, test } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { PROPERTY_SLUG, RUN, futureISO, loginAsOwner } from "./helpers";

// Moduł „Kanały": tryb synchronizacji i feed iCal. Testy sięgają do bazy
// (token feedu, rezerwacja kontrolna), stąd ładowanie .env.
loadEnvConfig(process.cwd());

type Db = typeof import("../../lib/db");

test.describe("kanały i iCal", () => {
  test.describe.configure({ mode: "serial" });

  test("przełącznik trybu synchronizacji zapisuje wybór", async ({ page }) => {
    const { prisma }: Db = await import("../../lib/db");
    const property = await prisma.property.findUniqueOrThrow({ where: { slug: PROPERTY_SLUG } });
    const original = property.syncMode;

    try {
      await loginAsOwner(page);
      await page.goto("/admin/kanaly");
      await page.getByRole("button", { name: "Bez synchronizacji" }).click();

      await expect
        .poll(
          async () =>
            (await prisma.property.findUniqueOrThrow({ where: { id: property.id } })).syncMode,
          { timeout: 15_000 }
        )
        .toBe("OFF");

      await page.reload();
      await page.getByRole("button", { name: "iCal", exact: true }).click();
      await expect
        .poll(
          async () =>
            (await prisma.property.findUniqueOrThrow({ where: { id: property.id } })).syncMode,
          { timeout: 15_000 }
        )
        .toBe("ICAL");
    } finally {
      await prisma.property.update({
        where: { id: property.id },
        data: { syncMode: original },
      });
    }
  });

  test("feed iCal oddaje rezerwację tylko po podaniu sekretu z adresu", async ({ page }) => {
    // Adres eksportu zawiera token, żeby obłożenie obiektu nie było publicznie
    // zgadywalne po samym numerze jednostki.
    const { prisma }: Db = await import("../../lib/db");
    const unit = await prisma.unit.findFirstOrThrow({
      where: { unitType: { property: { slug: PROPERTY_SLUG } } },
      orderBy: { id: "asc" },
    });
    const originalToken = unit.icalToken;
    const token = `e2e${RUN}`.toLowerCase().slice(0, 24);
    const code = `HO-E2E-ICAL-${RUN}`.toUpperCase().slice(0, 20);
    const checkIn = futureISO(700);
    const checkOut = futureISO(702);

    await prisma.unit.update({ where: { id: unit.id }, data: { icalToken: token } });
    await prisma.reservation.create({
      data: {
        code,
        unitId: unit.id,
        guestName: `E2E iCal ${RUN}`,
        email: `ical-${RUN}@example.com`,
        guests: 2,
        checkIn,
        checkOut,
        totalGr: 40000,
        depositGr: 12000,
        status: "CONFIRMED",
      },
    });

    try {
      const feed = `/api/ical/${unit.id}`;

      // bez sekretu i ze złym sekretem — nic nie wycieka (403, nie 404:
      // istnienie jednostki nie jest tajemnicą, jej obłożenie już tak)
      expect((await page.request.get(feed)).status()).toBe(403);
      expect((await page.request.get(`${feed}?t=nie-ten-token`)).status()).toBe(403);

      const ok = await page.request.get(`${feed}?t=${token}`);
      expect(ok.status()).toBe(200);

      const body = await ok.text();
      expect(body).toContain("BEGIN:VCALENDAR");
      expect(body).toContain("END:VCALENDAR");
      // termin rezerwacji w formacie iCal (bez myślników)
      expect(body).toContain(`DTSTART;VALUE=DATE:${checkIn.replace(/-/g, "")}`);
      expect(body).toContain(`DTEND;VALUE=DATE:${checkOut.replace(/-/g, "")}`);
    } finally {
      await prisma.reservation.deleteMany({ where: { code } });
      await prisma.unit.update({
        where: { id: unit.id },
        data: { icalToken: originalToken },
      });
    }
  });
});
